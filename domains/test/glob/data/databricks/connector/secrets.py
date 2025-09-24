"""Databricks connector secrets model.

Defines DatabricksSecrets which holds decrypted secrets used at runtime by
Databricks tools and client code. The class is intentionally small and typed
so it can be validated and passed through connector factory functions.
"""

from connectors.connector import ConnectorSecretsInterface
from pydantic import SecretStr


class DatabricksSecrets(ConnectorSecretsInterface):
    """Holds decrypted Databricks secrets for use at runtime.

    access_token: a SecretStr containing the Bearer token used for Databricks REST API calls.
    """

    access_token: SecretStr | None = None
