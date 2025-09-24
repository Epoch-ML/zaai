"""Databricks SQL REST API client.

This module implements DatabricksClient, a robust, asynchronous helper
for interacting with the Databricks SQL Statements API (/api/2.0/sql/statements).

Main responsibilities:
- Post SQL statements and poll for their completion.
- Retrieve and normalize result payloads across varying Databricks deployments.
- Implement retries/backoff for transient failures (network, 429, 5xx).

All public methods include docstrings describing their behavior, arguments,
and return values. The client is intentionally defensive about result
shapes because Databricks deployments may expose results in different
formats or endpoints.
"""

import json
from typing import Any, AsyncGenerator, Dict, List, Optional

import asyncio
import httpx


class DatabricksClient:
    """Client to interact with Databricks SQL Statements API.

    This client implements statement execution using the Databricks SQL Statements API
    (/api/2.0/sql/statements). It posts a statement, polls for completion, and then
    retrieves results. The client includes retry/backoff logic for transient network
    errors, 429 rate-limit responses, and 5xx server errors.

    The execute_sql method is defensive about result retrieval: Databricks deployments
    may expose result payloads in different shapes or endpoints. The implementation
    attempts multiple strategies to fetch/normalize results and includes expanded
    heuristics to extract results directly from the polled statement response when
    present (some deployments return rows inline rather than requiring a /result fetch).

    This makes the client robust across differing Databricks versions and configurations.
    """

    def __init__(self, workspace_url: str, access_token: str, timeout: int = 60, max_retries: int = 3):
        """Initialize the async HTTP client used for Databricks SQL API calls.

        Args:
            workspace_url: Base URL of the Databricks workspace (e.g., https://<instance>.cloud.databricks.com)
            access_token: Bearer token used for Authorization header
            timeout: HTTP client timeout in seconds
            max_retries: Number of retries for retriable errors (429 and 5xx and network errors)
        """
        self.workspace_url = workspace_url.rstrip("/")
        self.access_token = access_token
        self.timeout = timeout
        self.max_retries = max_retries
        self._client = httpx.AsyncClient(timeout=self.timeout)

    def _headers(self) -> Dict[str, str]:
        """Return the standard headers used for Databricks SQL API calls.

        Returns:
            Dict[str, str]: headers including Authorization and JSON content types.
        """
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def _request_with_retries(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Perform an HTTP request with simple retry/backoff for transient failures.

        Retries on network exceptions, 429 Too Many Requests, and 5xx server errors.
        Uses exponential backoff starting at 0.5s.

        Args:
            method: HTTP method name (e.g., 'GET', 'POST')
            url: Full URL to call
            **kwargs: additional httpx request kwargs (e.g., json=...)

        Returns:
            httpx.Response: successful response

        Raises:
            The last exception encountered if retries are exhausted.
        """
        attempt = 0
        backoff = 0.5
        while True:
            try:
                resp = await self._client.request(method, url, headers=self._headers(), **kwargs)
            except Exception:
                attempt += 1
                if attempt > self.max_retries:
                    raise
                await asyncio.sleep(backoff)
                backoff *= 2
                continue

            if resp.status_code == 429:
                attempt += 1
                if attempt > self.max_retries:
                    resp.raise_for_status()
                await asyncio.sleep(backoff)
                backoff *= 2
                continue

            if 500 <= resp.status_code < 600:
                attempt += 1
                if attempt > self.max_retries:
                    resp.raise_for_status()
                await asyncio.sleep(backoff)
                backoff *= 2
                continue

            return resp

    # ---- Result normalization helpers (split into smaller focused functions) ----
    def _rows_from_list(self, obj: list) -> List[Dict[str, Any]] | None:
        if not obj:
            return None
        # If items are dicts, use directly
        if all(isinstance(item, dict) for item in obj):
            return obj
        # If list items are lists, convert into dicts with numeric keys
        if all(isinstance(item, list) for item in obj):
            results_local: List[Dict[str, Any]] = []
            for row in obj:
                results_local.append({str(i): row[i] for i in range(len(row))})
            return results_local
        # Mixed -> wrap
        return [{"value": item} for item in obj]

    def _rows_from_data_block(self, data_block: dict) -> List[Dict[str, Any]] | None:
        # data_block might contain 'data' + 'schema' or 'rows' or 'results'
        if not isinstance(data_block, dict):
            return None

        if "data" in data_block:
            data_val = data_block.get("data")
            schema = data_block.get("schema")
            if isinstance(data_val, list) and schema and isinstance(schema, list):
                col_names = [c.get("name") for c in schema]
                results_local = []
                for row in data_val:
                    obj_row = {col_names[i] if i < len(col_names) else str(i): row[i] for i in range(len(row))}
                    results_local.append(obj_row)
                return results_local

            if isinstance(data_val, list) and all(isinstance(r, dict) for r in data_val):
                return data_val

            if isinstance(data_val, list) and data_val and isinstance(data_val[0], list):
                results_local = []
                for row in data_val:
                    results_local.append({str(i): row[i] for i in range(len(row))})
                return results_local

        if "rows" in data_block:
            rows = data_block.get("rows")
            if isinstance(rows, list):
                if all(isinstance(r, dict) for r in rows):
                    return rows
                if all(isinstance(r, list) for r in rows):
                    results_local = []
                    for r in rows:
                        results_local.append({str(i): v for i, v in enumerate(r)})
                    return results_local

        if "results" in data_block and isinstance(data_block.get("results"), list):
            results_local = []
            for item in data_block.get("results"):
                results_local.append(item if isinstance(item, dict) else {"value": item})
            return results_local

        # If dict values are all scalars, treat as single-row candidate
        if all(isinstance(v, (str, int, float, bool, type(None))) for v in data_block.values()):
            status_like_keys = {"status", "state", "statement_id", "id", "statusMessage"}
            if not any(k.lower() in status_like_keys for k in data_block.keys()):
                return [data_block]

        # If dict contains list-values of equal length, produce rows
        list_vals = [v for v in data_block.values() if isinstance(v, list)]
        if list_vals and all(isinstance(v, list) for v in data_block.values() if isinstance(v, list)):
            lengths = [len(v) for v in data_block.values() if isinstance(v, list)]
            if lengths:
                max_len = max(lengths)
                results_local = []
                for i in range(max_len):
                    row = {}
                    for k, v in data_block.items():
                        if isinstance(v, list) and i < len(v):
                            row[k] = v[i]
                        else:
                            if not isinstance(v, list):
                                row[k] = v
                    results_local.append(row)
                return results_local

        return None

    def _normalize_row_list(self, obj: Any) -> List[Dict[str, Any]] | None:
        """Normalize a variety of result payload shapes into list[dict]."""
        if isinstance(obj, list):
            return self._rows_from_list(obj)

        if isinstance(obj, dict):
            # Try common patterns using dedicated helper
            data_block = obj.get("result") or obj.get("data") or obj.get("output") or obj
            normalized = self._rows_from_data_block(data_block) if isinstance(data_block, dict) else None
            if normalized is not None:
                return normalized

            # Try direct 'results' key
            if "results" in obj and isinstance(obj.get("results"), list):
                results_local = []
                for item in obj.get("results"):
                    results_local.append(item if isinstance(item, dict) else {"value": item})
                return results_local

            # Single-row dict candidate
            if all(isinstance(v, (str, int, float, bool, type(None))) for v in obj.values()):
                status_like_keys = {"status", "state", "statement_id", "id", "statusMessage"}
                if not any(k.lower() in status_like_keys for k in obj.keys()):
                    return [obj]

            # Try to construct rows if dict values are lists
            list_vals = [v for v in obj.values() if isinstance(v, list)]
            if list_vals and all(isinstance(v, list) for v in obj.values() if isinstance(v, list)):
                lengths = [len(v) for v in obj.values() if isinstance(v, list)]
                if lengths:
                    max_len = max(lengths)
                    results_local = []
                    for i in range(max_len):
                        row = {}
                        for k, v in obj.items():
                            if isinstance(v, list) and i < len(v):
                                row[k] = v[i]
                            else:
                                if not isinstance(v, list):
                                    row[k] = v
                        results_local.append(row)
                    return results_local

        return None

    def _recursive_search_for_rows(self, obj: Any) -> List[Dict[str, Any]] | None:
        """Recursively search an arbitrary payload for a plausible result set (list of dicts) and normalize it.

        Walks nested dict/list structures and attempts to normalize the first found candidate.
        Returns normalized list[dict] or None if nothing is found.
        """
        # First try to normalize the obj itself
        normalized = self._normalize_row_list(obj)
        if normalized is not None:
            return normalized

        # Recurse for dicts and lists
        if isinstance(obj, dict):
            # Only recurse into keys that are likely to contain data to avoid mistaking status blocks as rows
            candidate_keys = [k for k in obj.keys() if k not in ("status", "state", "_links", "links")]
            for k in candidate_keys:
                try:
                    v = obj.get(k)
                    found = self._recursive_search_for_rows(v)
                    if found is not None:
                        return found
                except Exception:
                    continue
        elif isinstance(obj, list):
            for item in obj:
                found = self._recursive_search_for_rows(item)
                if found is not None:
                    return found
        return None

    # ---- Statement helpers split out from execute_sql for clarity ----
    async def _post_statement(self, sql: str, warehouse_id: str) -> dict:
        post_url = f"{self.workspace_url}/api/2.0/sql/statements"
        body = {"statement": sql, "warehouse_id": warehouse_id}
        resp = await self._request_with_retries("POST", post_url, json=body)
        resp.raise_for_status()
        return resp.json()

    async def _poll_statement(self, statement_id: str, poll_interval: float = 0.5) -> dict:
        status_url = f"{self.workspace_url}/api/2.0/sql/statements/{statement_id}"
        while True:
            sresp = await self._request_with_retries("GET", status_url)
            sresp.raise_for_status()
            sdata = sresp.json()
            state = sdata.get("status", {}).get("state") or sdata.get("status")
            if isinstance(state, dict):
                state = state.get("state")
            if state in ("SUCCEEDED", "COMPLETED", "FINISHED"):
                return sdata
            if state in ("FAILED", "CANCELED", "TIMEDOUT"):
                raise RuntimeError(f"Statement execution failed or canceled: {sdata}")
            await asyncio.sleep(poll_interval)

    async def _fetch_result_from_candidates(self, statement_id: str, sdata: dict) -> List[Dict[str, Any]] | None:
        # Collect candidate urls from possible fields in sdata
        result_url_candidates = []
        if isinstance(sdata, dict):
            result_obj = sdata.get("result") or sdata.get("output") or sdata.get("data") or {}
            if isinstance(result_obj, dict):
                for candidate_key in ("result_url", "resultUrl", "url", "link"):
                    v = result_obj.get(candidate_key)
                    if v:
                        result_url_candidates.append(v)
            links = sdata.get("links") or sdata.get("_links")
            if isinstance(links, list):
                for l in links:
                    if isinstance(l, dict) and l.get("href"):
                        result_url_candidates.append(l.get("href"))

        normalized_candidates = []
        for u in result_url_candidates:
            if isinstance(u, str):
                if u.startswith("/"):
                    normalized_candidates.append(self.workspace_url + u)
                else:
                    normalized_candidates.append(u)

        conventional_result_url = f"{self.workspace_url}/api/2.0/sql/statements/{statement_id}/result"
        if conventional_result_url not in normalized_candidates:
            normalized_candidates.append(conventional_result_url)

        last_exc: Exception | None = None
        for candidate in normalized_candidates:
            try:
                rresp = await self._request_with_retries("GET", candidate)
                rresp.raise_for_status()
                rdata = rresp.json()
                extracted = self._recursive_search_for_rows(rdata)
                if extracted is not None:
                    return extracted
                if isinstance(rdata, list):
                    return [item if isinstance(item, dict) else {"value": item} for item in rdata]
                if isinstance(rdata, dict):
                    extracted2 = self._recursive_search_for_rows(rdata)
                    if extracted2 is not None:
                        return extracted2
                    return [{"payload": rdata}]
                return [{"value": rdata}]
            except httpx.HTTPStatusError as http_err:
                last_exc = http_err
                continue
            except Exception as exc:
                last_exc = exc
                continue
        return None

    # ---- Public API ----
    async def execute_sql(self, sql: str, warehouse_id: str, max_rows: int | None = None) -> List[Dict[str, Any]]:
        """Execute SQL via /api/2.0/sql/statements and return rows as list of dicts.

        This method implements the create-statement -> poll -> fetch-results pattern used by
        Databricks SQL Statements API.

        The result retrieval portion is robust against variations in API behavior across
        Databricks deployments. It will attempt to extract results from the polled statement
        response if present, follow any result links reported, and finally attempt the
        conventional /result endpoint while gracefully handling 404 responses.

        If no retrievable rows are found but the statement completed successfully, this
        function returns an empty list rather than raising. This allows callers to
        differentiate "no rows" from an exceptional failure to execute statements.

        Args:
            sql: SQL string to execute
            warehouse_id: SQL warehouse id to run the statement on
            max_rows: Optional maximum number of rows to return (will truncate results)

        Returns:
            A list of row dictionaries normalized from the Databricks response.

        Raises:
            RuntimeError only for hard execution failures (e.g., POST failure), but not for missing /result resources.
        """
        payload = await self._post_statement(sql, warehouse_id)
        statement_id = payload.get("statement_id") or payload.get("id")
        if not statement_id:
            raise RuntimeError("Databricks statement did not return an id")

        sdata = await self._poll_statement(statement_id)

        # Try to extract rows from the polled statement payload explicitly
        if sdata is not None:
            result_block = None
            if isinstance(sdata, dict):
                result_block = sdata.get("result") or sdata.get("output") or sdata.get("data")
            if result_block is not None:
                extracted = self._recursive_search_for_rows(result_block)
                if extracted is not None:
                    results = extracted
                    if max_rows is not None:
                        results = results[:max_rows]
                    return results

        # Next, try extracting directly from the original post payload
        extracted_post = self._recursive_search_for_rows(payload)
        if extracted_post is not None:
            results = extracted_post
            if max_rows is not None:
                results = results[:max_rows]
            return results

        # If no inline results found, attempt any explicit result link in the statement object
        fetched = await self._fetch_result_from_candidates(statement_id, sdata or {})
        if fetched is not None:
            results = fetched
            if max_rows is not None:
                results = results[:max_rows]
            return results

        # If no candidate returned rows but statement succeeded, gracefully return empty list
        return []

    async def statement_succeeds(self, sql: str, warehouse_id: str, poll_interval: float = 0.5, timeout_seconds: int | None = 30) -> bool:
        """Run a statement and return True if the execution reaches a successful terminal state.

        This method is a lightweight health-check variant that posts a statement, polls its
        status until it reaches a terminal state, and returns whether it completed successfully.

        It purposefully avoids attempting to fetch a potentially absent /result resource which
        can return 404 in some Databricks deployments  this makes health checks more robust.
        """
        payload = await self._post_statement(sql, warehouse_id)
        statement_id = payload.get("statement_id") or payload.get("id")
        if not statement_id:
            return False

        status_url = f"{self.workspace_url}/api/2.0/sql/statements/{statement_id}"
        elapsed = 0.0
        while True:
            try:
                sresp = await self._request_with_retries("GET", status_url)
                sresp.raise_for_status()
                sdata = sresp.json()
                state = sdata.get("status", {}).get("state") or sdata.get("status")
                if isinstance(state, dict):
                    state = state.get("state")
                if state in ("SUCCEEDED", "COMPLETED", "FINISHED"):
                    return True
                if state in ("FAILED", "CANCELED", "TIMEDOUT"):
                    return False
            except Exception:
                # On any transient error while checking status, continue retrying until timeout
                pass

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval
            if timeout_seconds is not None and elapsed >= timeout_seconds:
                return False

    async def close(self) -> None:
        """Close the underlying httpx AsyncClient.

        Should be called to release network resources when the client is no longer needed.
        """
        await self._client.aclose()
