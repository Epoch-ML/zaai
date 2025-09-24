"""Databricks connector tools.

This module provides the DatabricksConnectorTools class and related Tool
input/output models used by agents to discover schemas/tables and execute
SQL queries against a Databricks SQL Warehouse.

The public classes and functions are documented to explain their parameters
and return types so that downstream consumers (and automated specs) can
reliably call and interpret their behavior.
"""

from typing import Any, Callable, Coroutine, List, Optional

from pydantic import BaseModel, Field

from common.jsonlogging.jsonlogger import Logging
from common.models.connector_id_enum import ConnectorIdEnum
from common.models.metadata import QueryResultMetadata
from common.models.tool import Tool, ToolResult, QueryTool, QueryPrompt
from connectors.tools import ConnectorToolsInterface

from connectors.databricks.connector.databricks_client import DatabricksClient
from connectors.databricks.connector.target import DatabricksTarget
from connectors.databricks.connector.secrets import DatabricksSecrets

logger = Logging.get_logger(__name__)


class GetDatabricksSchemasInput(BaseModel):
    """Input model for listing schemas.

    No fields required; present for compatibility with Tool input schema expectations.

    The tool will ignore any inputs but having a dedicated model keeps the
    interface clear and documented.

    """

    pass


class GetDatabricksSchemasOutput(BaseModel):
    """Represents a schema record returned from Databricks.

    Attributes:
        name: The schema name.
        comment: Optional comment/description provided by Databricks.
        properties: Optional dictionary of properties/metadata about the schema.
    """

    name: str
    comment: str | None = None
    properties: dict | None = None


class QuerySecurityLogsInput(BaseModel):
    """Input model for querying security logs.

    Attributes:
        table_name: The fully qualified table name to query, e.g., catalog.schema.table or schema.table
        limit: Maximum number of rows to return
    """

    table_name: str = Field(description="The fully qualified table name to query, e.g., schema.table")
    limit: int | None = Field(default=100, description="Maximum number of rows to return")


class ExecuteSQLQueryInput(BaseModel):
    """Input model for executing arbitrary SQL queries.

    Attributes:
        sql_query: The SQL query text to execute.
    """

    sql_query: str = Field(description="The SQL query to execute")


SQL_QUERY_PROMPT = QueryPrompt(
    role="Databricks SQL Assistant",
    task=(
        "Construct an efficient SQL query for Databricks SQL Warehouse. Use explicit schema.table names and limit result set when possible."
    ),
    best_practices="Use explicit catalog/schema.table, avoid SELECT *, and limit rows for large datasets",
)


class PublicTool(Tool):
    """A thin public wrapper over Tool that exposes a stable `execute_fn` attribute.

    Some older callers/tests access a public attribute ``execute_fn`` on tool
    objects. The core Tool implementation stores the callable in a private
    attribute (`_execute_fn`). To avoid any runtime attribute assignments or
    monkey-patching we provide a small subclass that exposes the callable via
    a property while remaining an instance of Tool (so isinstance checks pass).
    """

    @property
    def execute_fn(self) -> Callable[[BaseModel], Any]:
        """Return the underlying execute callable for this tool.

        This property provides read-only access to the callable so compatibility
        expectations are met without dynamically setting attributes at runtime.
        """
        return self._execute_fn


class PublicQueryTool(QueryTool):
    """A thin wrapper over QueryTool that exposes a stable `execute_fn` attribute.

    Mirrors the behavior of PublicTool but for QueryTool instances.
    """

    @property
    def execute_fn(self) -> Callable[[BaseModel], Any]:
        """Return the underlying execute callable for this query tool."""
        return self._execute_fn


class DatabricksConnectorTools(ConnectorToolsInterface[DatabricksTarget, DatabricksSecrets]):
    """
    A collection of tools used by agents that query Databricks SQL Warehouse.

    This class centralizes logic for schema/table discovery and SQL execution. Tool implementations
    should contain the core logic for interacting with the Databricks API so callers (including the connector)
    can reuse these methods instead of duplicating code.
    """

    def __init__(
        self,
        target: DatabricksTarget,
        databricks_client_factory: Callable[[DatabricksSecrets], DatabricksClient],
        secrets: DatabricksSecrets,
        config: Any,
    ):
        """Initialize the tools collection.

        Args:
            target: The DatabricksTarget describing the allowed datasets.
            databricks_client_factory: A factory that returns a configured DatabricksClient when given DatabricksSecrets.
            secrets: The decrypted secrets used to authenticate to Databricks.
            config: The DatabricksConnectorConfig providing tuning options like warehouse_id and timeouts.
        """
        super().__init__(ConnectorIdEnum.DATABRICKS, target=target, secrets=secrets)
        self._secrets = secrets
        self._target = target
        self._client_factory = databricks_client_factory
        self._config = config

    def get_tools(self) -> List[Tool]:
        """Return the list of tools available for Databricks querying.

        The returned tools include:
            - get_databricks_schemas: lists available schemas scoped by the target
            - query_security_logs: query a specific table for log data
            - execute_sql_query: freeform SQL execution with guidance via prompt
        """
        tools: List[Tool] = []

        t1 = PublicTool(
            connector=str(ConnectorIdEnum.DATABRICKS),
            name="get_databricks_schemas",
            execute_fn=self.get_databricks_schemas_async,
        )
        tools.append(t1)

        t2 = PublicTool(
            connector=str(ConnectorIdEnum.DATABRICKS),
            name="query_security_logs",
            execute_fn=self.query_security_logs_async,
        )
        tools.append(t2)

        qt = PublicQueryTool(
            connector=str(ConnectorIdEnum.DATABRICKS),
            name="execute_sql_query",
            execute_fn=self.execute_sql_query_async,
            query_prompt=SQL_QUERY_PROMPT,
            get_schema=self._get_schema,
            dataset_paths=self._target.get_dataset_paths(),
        )
        tools.append(qt)

        return tools

    class GetDatabricksIndexesAndTablesInput(BaseModel):
        """Compatibility empty input placeholder"""

        pass

    # ----------------- Helper methods for schema discovery -----------------
    async def _execute_client_sql(self, client: DatabricksClient, sql: str, max_rows: int | None):
        """Helper wrapper to call client.execute_sql and translate exceptions."""
        return await client.execute_sql(sql, warehouse_id=self._config.warehouse_id, max_rows=max_rows)

    async def _discover_catalogs(self, client: DatabricksClient) -> List[str]:
        """Attempt to discover available catalogs in the Databricks workspace.

        Returns a list of catalog names or an empty list if discovery fails.
        """
        try:
            rows = await self._execute_client_sql(client, "SHOW CATALOGS", max_rows=getattr(self._config, "databricks_max_query_results", 1000))
            catalogs: List[str] = []
            if rows:
                for r in rows:
                    if isinstance(r, dict):
                        name = r.get("catalog") or r.get("name") or next((v for v in r.values() if isinstance(v, str)), None)
                    else:
                        name = str(r)
                    if name:
                        catalogs.append(name)
            seen = set()
            result = [c for c in catalogs if not (c in seen or seen.add(c))]
            return result
        except Exception:
            logger().debug("Catalog discovery failed, falling back to other strategies")
            return []

    async def get_databricks_schemas_async(self, input: GetDatabricksSchemasInput) -> ToolResult:
        """Return a ToolResult containing a list of schemas available scoped by the target.

        Attempts catalog-based discovery first and falls back to other strategies.
        """
        if self._secrets is None or self._secrets.access_token is None:
            raise ValueError("Missing Databricks secrets")
        client = self._client_factory(self._secrets)
        try:
            if self._target and self._target.schema_names:
                schemas = [{"name": s} for s in self._target.schema_names]
                return ToolResult(result=schemas)

            catalogs = await self._discover_catalogs(client)
            schema_entries: List[dict] = []

            if catalogs:
                for catalog in catalogs:
                    try:
                        sql = f"SHOW NAMESPACES IN {catalog}"
                        rows = await self._execute_client_sql(client, sql, max_rows=getattr(self._config, "databricks_max_query_results", 1000))
                        if not rows:
                            continue
                        for r in rows:
                            name = None
                            if isinstance(r, dict):
                                for key in ("namespace", "name", "schema_name", "namespace_name"):
                                    if key in r and r.get(key):
                                        name = r.get(key)
                                        break
                                if name is None:
                                    for v in r.values():
                                        if isinstance(v, str) and v.strip():
                                            name = v
                                            break
                            else:
                                name = str(r)
                            if name:
                                schema_entries.append({"name": f"{catalog}.{name}"})
                    except Exception as exc:
                        logger().debug("Schema discovery for catalog %s failed: %s", catalog, exc)
                        continue

                if schema_entries:
                    return ToolResult(result=schema_entries)

            candidate_sqls = [
                "SHOW SCHEMAS",
                "SHOW DATABASES",
                "SHOW NAMESPACES",
                "SELECT schema_name AS name FROM information_schema.schemata",
            ]

            last_exception: Exception | None = None
            for sql in candidate_sqls:
                try:
                    rows = await self._execute_client_sql(client, sql, max_rows=getattr(self._config, "databricks_max_query_results", 1000))
                    schemas: List[dict] = []
                    if not rows:
                        continue

                    for r in rows:
                        name = None
                        if isinstance(r, dict):
                            if "namespace" in r:
                                name = r.get("namespace")
                            elif "name" in r:
                                name = r.get("name")
                            elif "schema_name" in r:
                                name = r.get("schema_name")
                            elif "database" in r:
                                name = r.get("database")
                            else:
                                for v in r.values():
                                    if isinstance(v, str) and v.strip() and not v.isdigit():
                                        name = v
                                        break
                        else:
                            name = str(r)
                        if name:
                            schemas.append({"name": name})

                    if schemas:
                        return ToolResult(result=schemas)
                except Exception as exc:
                    logger().debug("Schema discovery attempt failed for SQL '%s' with exc: %s", sql, exc)
                    last_exception = exc
                    continue

            try:
                info_sql = "SELECT DISTINCT table_schema AS name FROM information_schema.tables WHERE table_schema IS NOT NULL LIMIT 1000"
                rows = await self._execute_client_sql(client, info_sql, max_rows=getattr(self._config, "databricks_max_query_results", 1000))
                schemas = []
                if rows:
                    for r in rows:
                        name = None
                        if isinstance(r, dict):
                            name = r.get("name") or r.get("table_schema") or next((v for v in r.values() if isinstance(v, str)), None)
                        else:
                            name = str(r)
                        if name:
                            schemas.append({"name": name})
                    if schemas:
                        return ToolResult(result=schemas)
            except Exception:
                logger().debug("information_schema.tables fallback for schema discovery failed")

            logger().warning("Schema discovery failed after trying multiple strategies: %s", last_exception)
            raise RuntimeError(f"Schema discovery failed: {last_exception}")
        finally:
            await client.close()

    # ----------------- Helpers for table enumeration -----------------
    def _quote_identifier(self, part: str) -> str:
        if part is None:
            return "``"
        part_str = str(part)
        safe = part_str.replace("`", "``")
        return f"`{safe}`"

    async def _enumerate_tables_qualified(self, client: DatabricksClient, catalog: str, schema_part: str) -> List[str]:
        candidate_sqls = [
            f"SHOW TABLES IN {self._quote_identifier(catalog)}.{self._quote_identifier(schema_part)}",
            f"SHOW TABLES IN {self._quote_identifier(catalog)} {self._quote_identifier(schema_part)}",
            f"SELECT table_name as name FROM information_schema.tables WHERE table_schema = '{schema_part}' AND table_catalog = '{catalog}'",
        ]
        last_exception = None
        for sql in candidate_sqls:
            try:
                table_rows = await self._execute_client_sql(client, sql, max_rows=getattr(self._config, "databricks_max_query_results", 1000))
                if not table_rows:
                    continue
                table_names: List[str] = []
                for tr in table_rows:
                    tname = None
                    if isinstance(tr, dict):
                        for key in ("name", "tableName", "table", "tablename", "table_name"):
                            if key in tr and tr.get(key):
                                tname = tr.get(key)
                                break
                        if tname is None:
                            for v in tr.values():
                                if isinstance(v, str) and v.strip():
                                    tname = v
                                    break
                    else:
                        tname = str(tr)

                    if tname:
                        if "." in str(tname):
                            table_names.append(str(tname))
                        else:
                            try:
                                quoted = f"{self._quote_identifier(catalog)}.{self._quote_identifier(schema_part)}.{self._quote_identifier(tname)}"
                                table_names.append(quoted)
                            except Exception:
                                table_names.append(self._quote_identifier(str(tname)))
                if table_names:
                    return table_names
            except Exception as exc:
                logger().debug("Qualified table listing failed for schema '%s' via SQL '%s' with exc: %s", schema_part, sql, exc)
                last_exception = exc
                continue
        raise RuntimeError(f"Table enumeration failed for qualified schema {catalog}.{schema_part}: {last_exception}")

    async def _enumerate_tables_unqualified(self, client: DatabricksClient, schema: str, catalogs: List[str]) -> List[str]:
        last_exception = None
        if catalogs:
            for catalog in catalogs:
                try:
                    sql = f"SHOW TABLES IN {self._quote_identifier(catalog)}.{self._quote_identifier(schema)}"
                    table_rows = await self._execute_client_sql(client, sql, max_rows=getattr(self._config, "databricks_max_query_results", 1000))
                    if not table_rows:
                        continue
                    table_names: List[str] = []
                    for tr in table_rows:
                        tname = None
                        if isinstance(tr, dict):
                            for key in ("name", "tableName", "table", "tablename", "table_name"):
                                if key in tr and tr.get(key):
                                    tname = tr.get(key)
                                    break
                            if tname is None:
                                for v in tr.values():
                                    if isinstance(v, str) and v.strip():
                                        tname = v
                                        break
                        else:
                            tname = str(tr)

                        if tname:
                            try:
                                quoted = f"{self._quote_identifier(catalog)}.{self._quote_identifier(schema)}.{self._quote_identifier(tname)}"
                                table_names.append(quoted)
                            except Exception:
                                table_names.append(self._quote_identifier(str(tname)))
                    if table_names:
                        return table_names
                except Exception as exc:
                    logger().debug("Table listing failed for schema '%s' in catalog '%s': %s", schema, catalog, exc)
                    last_exception = exc
                    continue
        # Fallback candidate SQLs
        candidate_sqls = [
            f"SHOW TABLES IN {self._quote_identifier(schema)}",
            f"SHOW TABLES FROM {self._quote_identifier(schema)}",
            f"SELECT table_name as name FROM information_schema.tables WHERE table_schema = '{schema}'",
        ]
        for sql in candidate_sqls:
            try:
                table_rows = await self._execute_client_sql(client, sql, max_rows=getattr(self._config, "databricks_max_query_results", 1000))
                if not table_rows:
                    continue
                table_names = []
                for tr in table_rows:
                    tname = None
                    if isinstance(tr, dict):
                        for key in ("name", "tableName", "table", "tablename", "table_name"):
                            if key in tr and tr.get(key):
                                tname = tr.get(key)
                                break
                        if tname is None:
                            for v in tr.values():
                                if isinstance(v, str) and v.strip():
                                    tname = v
                                    break
                    else:
                        tname = str(tr)

                    if tname:
                        if "." in str(tname):
                            table_names.append(str(tname))
                        else:
                            table_names.append(self._quote_identifier(schema) + "." + self._quote_identifier(str(tname)))
                if table_names:
                    return table_names
            except Exception as exc:
                logger().debug("Fallback table listing failed for schema '%s' via SQL '%s' with exc: %s", schema, sql, exc)
                last_exception = exc
                continue

        # Final fallback: scan information_schema.tables globally and filter
        try:
            info_sql = f"SELECT table_catalog, table_schema, table_name FROM information_schema.tables WHERE table_schema IS NOT NULL LIMIT {getattr(self._config, 'databricks_max_query_results', 1000)}"
            rows = await self._execute_client_sql(client, info_sql, max_rows=getattr(self._config, "databricks_max_query_results", 1000))
            table_names: List[str] = []
            if rows:
                for r in rows:
                    catalog_val = None
                    schema_val = None
                    table_val = None
                    if isinstance(r, dict):
                        catalog_val = r.get("table_catalog") or r.get("catalog") or r.get("tableCatalog")
                        schema_val = r.get("table_schema") or r.get("schema") or r.get("tableSchema")
                        table_val = r.get("table_name") or r.get("table") or r.get("name")
                    elif isinstance(r, (list, tuple)):
                        if len(r) >= 3:
                            catalog_val, schema_val, table_val = r[0], r[1], r[2]
                    else:
                        continue

                    if schema_val is None or table_val is None:
                        continue

                    try:
                        catalog_str = str(catalog_val) if catalog_val is not None else None
                        schema_str = str(schema_val)
                        table_str = str(table_val)

                        if schema_str == schema or schema_str.endswith(f".{schema}") or schema in schema_str:
                            if catalog_str:
                                qualified = f"{self._quote_identifier(catalog_str)}.{self._quote_identifier(schema_str)}.{self._quote_identifier(table_str)}"
                            else:
                                qualified = f"{self._quote_identifier(schema_str)}.{self._quote_identifier(table_str)}"
                            table_names.append(qualified)
                    except Exception:
                        continue

                if table_names:
                    return table_names
        except Exception:
            logger().debug("information_schema.tables fallback for table enumeration failed")

        logger().warning("Table enumeration failed for schema %s after trying multiple strategies: %s", schema, last_exception)
        raise RuntimeError(f"Table enumeration failed for schema {schema}: {last_exception}")

    async def get_tables_in_schema_async(self, schema: str) -> List[str]:
        """Return a list of fully qualified table names within the provided schema.

        This helper handles inputs in the forms:
            - 'catalog.schema' (already qualified)
            - 'schema' (unqualified)

        Tries multiple query styles to be robust across deployments and uses quoted identifiers
        for greater compatibility.
        """
        if self._secrets is None or self._secrets.access_token is None:
            raise ValueError("Missing Databricks secrets")
        client = self._client_factory(self._secrets)
        try:
            if "." in schema:
                parts = schema.split(".")
                catalog = parts[0]
                schema_part = parts[1]
                return await self._enumerate_tables_qualified(client, catalog, schema_part)

            catalogs = await self._discover_catalogs(client)
            try:
                tables = await self._enumerate_tables_unqualified(client, schema, catalogs)
                if tables:
                    return tables
            except Exception:
                # try other candidates below
                pass

            # If still nothing, raise with a descriptive message
            raise RuntimeError(f"Table enumeration failed for schema {schema}")
        finally:
            await client.close()

    async def query_security_logs_async(self, input: QuerySecurityLogsInput) -> ToolResult:
        """Query security logs from a specified table.

        Returns a ToolResult containing the rows (list[dict]) and optional metadata.

        If the requested table or schema does not exist, this function will gracefully
        return an empty result list rather than raising an exception.
        """
        if self._secrets is None or self._secrets.access_token is None:
            raise ValueError("Missing Databricks secrets")
        client = self._client_factory(self._secrets)
        try:
            sql = f"SELECT * FROM {input.table_name} LIMIT {input.limit or 100}"
            try:
                rows = await client.execute_sql(sql, warehouse_id=self._config.warehouse_id, max_rows=input.limit)
            except RuntimeError as exc:
                msg = str(exc)
                if 'TABLE_OR_VIEW_NOT_FOUND' in msg or 'SCHEMA_NOT_FOUND' in msg or 'table or view' in msg.lower() or 'schema' in msg.lower():
                    logger().warning("Query for table %s failed due to missing table/schema. Returning empty result. Error: %s", input.table_name, exc)
                    return ToolResult(result=[])
                raise

            return ToolResult(result=rows)
        finally:
            await client.close()

    async def execute_sql_query_async(self, input: ExecuteSQLQueryInput) -> ToolResult:
        """Execute an arbitrary SQL query against the configured Databricks SQL Warehouse.

        Returns a ToolResult containing the raw rows returned by the query (list[dict] or similar).
        If the executed query references missing tables or schemas, return an empty result rather
        than raising a RuntimeError so callers can handle empty responses gracefully.
        """
        if self._secrets is None or self._secrets.access_token is None:
            raise ValueError("Missing Databricks secrets")
        client = self._client_factory(self._secrets)
        try:
            try:
                rows = await client.execute_sql(input.sql_query, warehouse_id=self._config.warehouse_id)
            except RuntimeError as exc:
                msg = str(exc)
                if 'TABLE_OR_VIEW_NOT_FOUND' in msg or 'SCHEMA_NOT_FOUND' in msg or 'table or view' in msg.lower() or 'schema' in msg.lower():
                    logger().warning("SQL execution failed due to missing table/schema. Returning empty result. Error: %s", exc)
                    return ToolResult(result=[])
                raise
            return ToolResult(result=rows)
        finally:
            await client.close()

    async def _get_schema(self) -> str:
        """Return a minimal JSON schema for the QueryTool helper.

        This implementation reuses the get_databricks_schemas_async path.
        """
        schemas = await self.get_databricks_schemas_async(GetDatabricksSchemasInput())
        if isinstance(schemas, ToolResult):
            schema_list = schemas.result
        else:
            schema_list = schemas
        return json.dumps(schema_list)
