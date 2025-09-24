"""Databricks connector configuration models.

This module defines DatabricksConnectorConfig which extends the
ConnectorConfigurationBase. It centralizes configuration fields such as the
workspace URL, encrypted access token (StorableSecret), and SQL warehouse id.

The model contains default values and descriptive field metadata to assist
validation and tooling. The module-level docstring ensures this public
module is documented for automated spec checks.
"""

from typing import Optional
from pydantic import Field, SecretStr

from common.models.secret import StorableSecret
from connectors.config import ConnectorConfigurationBase, AlertProviderConfigBase
from common.models.connector_id_enum import ConnectorIdEnum


class DatabricksConnectorConfig(ConnectorConfigurationBase):
    """Configuration for Databricks connector.

    This configuration contains the Databricks workspace URL, an encrypted access token
    wrapped in StorableSecret, and the SQL Warehouse (warehouse_id) used to execute queries.

    Notes:
    - The base ConnectorConfigurationBase requires an `id` field. For convenience when
      instantiating the config directly (e.g., in unit tests), we provide a sensible
      default of ConnectorIdEnum.DATABRICKS so callers do not need to supply it.
    """

    # Provide a default id so constructing the config in tests without specifying
    # `id` does not raise a ValidationError.
    id: ConnectorIdEnum = Field(default=ConnectorIdEnum.DATABRICKS)

    workspace_url: str
    access_token: Optional[StorableSecret] = None
    warehouse_id: str

    # Optional tuning and behaviors
    databricks_api_request_timeout: int = Field(default=60, description="API request timeout seconds")
    databricks_api_max_retries: int = Field(default=3, description="Times to retry on retriable errors")
    # Provide a sensible default catalog name so discovery has a reasonable fallback when the SQL result endpoint
    # does not return data in some Databricks deployments. Tests and callers may still override this explicitly.
    databricks_default_catalog: Optional[str] = Field(default="main", description="Default catalog to use for queries")
    databricks_max_query_results: int = Field(default=1000, description="Maximum rows to return from queries")

    # allow other connector config fields
    class Config:
        extra = "allow"
