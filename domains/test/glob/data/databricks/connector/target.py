"""Databricks connector target model.

DatabricksTarget lists the catalog/schema/table values that an agent is
allowed to query. The model normalizes table identifiers and exposes
get_dataset_paths() which returns paths usable by dataset description
and tooling layers.
"""

from typing import List
from connectors.connector import ConnectorTargetInterface


class DatabricksTarget(ConnectorTargetInterface):
    """Defines what Databricks schemas/tables are allowed as query targets.

    The agent will only be allowed to query datasets returned by get_dataset_paths().
    The DatabricksTarget model lists explicit schema names and table names that the
    agent is permitted to query. Table names may be provided as either fully
    qualified identifiers (e.g., "schema.table") or as bare table names.
    """

    schema_names: List[str] = []
    table_names: List[str] = []

    def get_dataset_paths(self) -> list[list[str]]:
        """Return dataset paths represented as lists suitable for dataset description and tooling.

        Each returned path is one of the following shapes:
        - [schema]
        - [schema, table]

        Table names that are provided in the form "schema.table" will be split into
        their parts and returned as a two-element list. Bare table names will be
        returned as [table] unless a schema is also provided. This method is a
        pure transformation and does not attempt to consult Databricks; it simply
        normalizes the configured target values so downstream code can operate on
        a consistent path shape.

        Returns:
            list[list[str]]: A list of dataset path lists.
        """
        # Represent each allowed dataset as a single path: [schema] or [schema, table]
        paths: list[list[str]] = []
        for s in self.schema_names:
            paths.append([s])
        for t in self.table_names:
            # Table names may be given as schema.table or just table; return as list for compatibility
            if "." in t:
                parts = t.split(".")
                paths.append(parts)
            else:
                paths.append([t])
        return paths
