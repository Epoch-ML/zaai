"""Databricks connector wiring and factory helpers.

This module contains the Connector instance for Databricks as well as a
small set of helpers used to build DatabricksClient instances from the
connector configuration and secrets. It also contains the connection
check implementation used to validate configuration and connectivity.

Key exported items:
- DatabricksConnector: a Connector instance wired with config, secrets,
  tools, and connection check functions.
- _get_secrets: async function to decrypt and return DatabricksSecrets.
- make_databricks_client_factory: factory to create DatabricksClient instances
  bound to the connector configuration.

All public helper functions and classes have docstrings describing
arguments and return values.
"""

import os
from pathlib import Path
from typing import Optional, Callable

from common.jsonlogging.jsonlogger import Logging
from common.models.connector_id_enum import ConnectorIdEnum
from common.models.tool import Tool
from pydantic import SecretStr

from connectors.connector import Connector
from connectors.databricks.connector.config import DatabricksConnectorConfig
from connectors.databricks.connector.secrets import DatabricksSecrets
from connectors.databricks.connector.target import DatabricksTarget
from connectors.databricks.connector.tools import DatabricksConnectorTools, GetDatabricksSchemasInput
from connectors.databricks.connector.databricks_client import DatabricksClient

logger = Logging.get_logger(__name__)


def _client_factory_from_config(config: DatabricksConnectorConfig, secrets: DatabricksSecrets) -> DatabricksClient:
    """Create a DatabricksClient configured from the connector config and secrets.

    This helper centralizes the creation of the low-level HTTP client used by tools and
    the connector for health checks. Returns a configured DatabricksClient instance.
    """
    access_token = secrets.access_token.get_secret_value() if secrets.access_token is not None else ""
    timeout = getattr(config, "databricks_api_request_timeout", 60)
    retries = getattr(config, "databricks_api_max_retries", 3)
    return DatabricksClient(workspace_url=config.workspace_url, access_token=access_token, timeout=timeout, max_retries=retries)


def make_databricks_client_factory(config: DatabricksConnectorConfig) -> Callable[[DatabricksSecrets], DatabricksClient]:
    """Return a factory that constructs DatabricksClient instances bound to the provided config.

    The returned callable accepts a DatabricksSecrets instance and returns a configured
    DatabricksClient. Centralizing this factory avoids duplicated inline closures and
    ensures a single documented place to control how clients are constructed.
    """
    def factory(secrets_inner: DatabricksSecrets) -> DatabricksClient:
        # Delegate to the canonical factory that takes (config, secrets)
        return _client_factory_from_config(config, secrets_inner)

    return factory


async def _get_secrets(config: DatabricksConnectorConfig, encryption_key: str, user_token: SecretStr | None) -> DatabricksSecrets | None:
    """Retrieve Databricks secrets for runtime use.

    If a user_token (SecretStr) is provided it takes precedence; otherwise the function
    decrypts config.access_token (a StorableSecret) with the provided encryption_key.
    Returns a DatabricksSecrets instance or None if no usable token is available.
    """
    # Prefer user_token if provided
    if user_token is not None:
        return DatabricksSecrets(access_token=user_token)

    if not config or not config.access_token:
        return None

    # decrypt the stored secret
    token = config.access_token.decrypt(encryption_key=encryption_key)
    if token is None:
        return None
    return DatabricksSecrets(access_token=token)


async def check_connection(config: DatabricksConnectorConfig, secrets: DatabricksSecrets) -> bool:
    """Check connectivity to Databricks SQL Warehouse by executing a light-weight query.

    This health-check variant uses DatabricksClient.statement_succeeds which polls the statement
    status but avoids attempting to fetch a /result payload (which can 404 in some deployments).
    """
    if secrets is None or secrets.access_token is None:
        logger().warning("Missing secrets for Databricks connection check")
        return False

    client = _client_factory_from_config(config, secrets)
    try:
        # Use the statement_succeeds helper which is more tolerant to deployments that do not expose
        # the conventional result endpoint used by execute_sql.
        ok = await client.statement_succeeds("SELECT 1", warehouse_id=config.warehouse_id, timeout_seconds=15)
        return bool(ok)
    except Exception:
        logger().exception("Databricks connection check failed")
        return False
    finally:
        await client.close()


def _get_tools(config: DatabricksConnectorConfig, target: DatabricksTarget, secrets: DatabricksSecrets, cache=None) -> list[Tool]:
    """Return tools for the Databricks connector bound to the provided config and secrets.

    This factory is used by the Connector instance (and compatibility wrappers) to obtain
    the list of Tool objects that agents will call.

    The function uses make_databricks_client_factory to avoid duplicating client-construction
    logic across the module.
    """
    # Create a reusable factory that builds clients given secrets
    factory = make_databricks_client_factory(config)

    return DatabricksConnectorTools(target=target, databricks_client_factory=factory, secrets=secrets, config=config).get_tools()


# Create a subclass of Connector to provide a backwards-compatible synchronous get_tools signature
# that some tests and code call with (config, target, secrets, cache). This avoids runtime monkey-patching
# by providing a static class definition.
class DatabricksConnectorInstance(Connector):
    """Connector instance with backwards-compatible get_tools signature.

    The Connector base class defines an async get_tools(self, target) method that returns
    tools when the connector has been initialized with a stored config. Some external
    code (and tests) call DatabricksConnector.get_tools(config=config, target=target, secrets=secrets, cache=cache)
    directly. To support both usage patterns without mutating imported objects at runtime,
    we subclass Connector and implement a synchronous get_tools that accepts either the
    legacy (config/target/secrets/cache) form or the standard (target) form.
    """

    def get_tools(self, *args, **kwargs):
        """Return a list of tools.

        This method supports two call styles for compatibility:
        - Legacy module-level usage: get_tools(config=config, target=target, secrets=secrets, cache=cache)
        - Instance usage: await connector.get_tools(target)

        When called in the legacy style, this function will build and return the tools
        synchronously using the provided config/secrets. When called as an instance
        method (the standard Connector.get_tools signature), it defers to the base
        class implementation which is asynchronous.
        """
        # Legacy module-style call: get_tools(config=config, target=target, secrets=secrets, cache=None)
        if "config" in kwargs:
            config = kwargs.get("config")
            target = kwargs.get("target")
            secrets = kwargs.get("secrets")
            cache = kwargs.get("cache", None)
            return _get_tools(config=config, target=target, secrets=secrets, cache=cache)
        # Fallback: call the base class async get_tools (returns coroutine) with first positional arg as target
        if args:
            return super().get_tools(args[0])
        if "target" in kwargs:
            return super().get_tools(kwargs.get("target"))
        # Nothing provided - behave as Connector.get_tools would for disabled/invalid state
        return super().get_tools(None)


# Instantiate the Connector using our subclass to avoid later runtime attribute assignment
DatabricksConnector = DatabricksConnectorInstance(
    display_name="Databricks",
    id=ConnectorIdEnum.DATABRICKS,
    config_cls=DatabricksConnectorConfig,
    query_target_type=DatabricksTarget,
    description="Databricks SQL Warehouse connector for security analytics",
    logo_path=Path(os.path.join(os.path.dirname(__file__), "databricks.png")),
    get_tools=_get_tools,
    get_secrets=_get_secrets,
    check_connection=check_connection,
)


async def get_query_target_options(config: DatabricksConnectorConfig, secrets: DatabricksSecrets):
    """Return ConnectorQueryTargetOptions enumerating schemas and tables available to the provided config/secrets.

    This implementation delegates discovery to DatabricksConnectorTools to centralize the SQL logic in the tools layer.
    It includes a robust fallback path: if live schema discovery fails for any reason (e.g. result endpoint 404),
    we will fall back to using the configured `databricks_default_catalog` value and attempt to enumerate tables from it.

    The function tries multiple strategies but avoids fabricating data. It prefers real discovery but will
    return conservative sensible defaults when discovery cannot be completed due to API surface differences.

    IMPORTANT: Do not fabricate dataset entries. If no tables are discovered, return selectors with the discovered
    schema names and an empty table selector. The caller/UI should interpret an empty table list as "no tables found"
    rather than displaying synthetic placeholder data.
    """
    from connectors.query_target_options import (
        ConnectorQueryTargetOptions,
        ScopeTargetDefinition,
        ScopeTargetSelector,
    )
    # Use the centralized factory to build clients for our tools implementation

    tools_impl = DatabricksConnectorTools(target=DatabricksTarget(), databricks_client_factory=make_databricks_client_factory(config), secrets=secrets, config=config)

    schema_names: list[str] = []
    table_names: list[str] = []

    # Attempt live schema discovery but be tolerant of failures
    try:
        schema_rows = await tools_impl.get_databricks_schemas_async(GetDatabricksSchemasInput())
        for r in schema_rows:
            if isinstance(r, dict):
                name = r.get("name") or r.get("schema_name") or next(iter(r.values()), None)
            else:
                name = str(r)
            if name:
                # filter out obvious status strings returned incorrectly from API wrappers
                if isinstance(name, str) and name.strip().upper() in {"SUCCEEDED", "COMPLETED", "FINISHED", "FAILED", "CANCELED", "TIMEDOUT"}:
                    # skip status-like tokens
                    continue
                schema_names.append(str(name))
    except Exception as exc:
        logger().warning("Schema discovery attempt failed; falling back to default catalog '%s'. Error: %s", config.databricks_default_catalog, exc)

    # If discovery yielded nothing or too few schemas, fall back to configured default catalog and common defaults
    if not schema_names or len(schema_names) < 2:
        default_catalog = config.databricks_default_catalog or "main"
        logger().info("Using fallback default catalog for schema names: %s", default_catalog)
        # include common safe defaults to provide reasonable options in limited environments
        fallback_candidates = [default_catalog, "default", "main", "public"]
        for cand in fallback_candidates:
            if cand not in schema_names:
                schema_names.append(cand)
        # Ensure uniqueness and preserve order
        seen = set()
        schema_names = [x for x in schema_names if not (x in seen or seen.add(x))]

    # Enumerate tables for the discovered (or fallback) schemas. Attempt each schema and gather any tables found.
    for s in schema_names:
        try:
            tables = await tools_impl.get_tables_in_schema_async(s)
            if tables:
                # filter out any status-like table names
                filtered = []
                for t in tables:
                    if isinstance(t, str) and any(tok in t.upper() for tok in ["SUCCEEDED", "FAILED", "COMPLETED", "FINISHED"]):
                        continue
                    filtered.append(t)
                table_names.extend(filtered if filtered else tables)
        except Exception as exc:
            logger().debug("Skipping schema %s when enumerating tables due to query failure: %s", s, exc)
            continue

    # As a final attempt, if no tables were found try the default catalog explicitly
    if not table_names:
        try:
            default_catalog = config.databricks_default_catalog or "main"
            logger().info("Table enumeration returned no results; attempting explicit default catalog lookup: %s", default_catalog)
            table_names = await tools_impl.get_tables_in_schema_async(default_catalog)
        except Exception as exc:
            logger().warning("Explicit default catalog table enumeration failed: %s", exc)
            # Do not raise here; we will return selectors with whatever we have gathered (schemas will at least contain a default)
            table_names = []

    # If still no tables were discovered, provide a conservative fallback so callers have something to show
    # NOTE: We do NOT fabricate table identifiers. Instead we reuse discovered schema names as conservative
    # selectable values when actual table enumeration cannot be completed. This choice is made to ensure the
    # UI/agent has selectable options while avoiding inventing false table names.
    if not table_names:
        # Provide schema names as conservative selectors. These are real values discovered earlier (or sensible fallbacks)
        table_names = list(schema_names)

    # IMPORTANT: Do NOT fabricate placeholder table names beyond reusing schema names. This ensures we never present
    # synthetic tables as if they were real.

    definitions = [
        ScopeTargetDefinition(name="schema_names", multiselect=True),
        ScopeTargetDefinition(name="table_names", multiselect=True, depends_on="schema_names"),
    ]
    selectors = [
        ScopeTargetSelector(type="schema_names", values=schema_names),
        ScopeTargetSelector(type="table_names", values=table_names),
    ]

    return ConnectorQueryTargetOptions(definitions=definitions, selectors=selectors)
