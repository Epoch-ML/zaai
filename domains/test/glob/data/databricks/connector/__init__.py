"""Databricks connector package

This package contains the Databricks connector implementation used to interact
with a Databricks SQL Warehouse for security analytics. It provides:
- connector config model
- secrets model
- target model
- low-level DatabricksClient for SQL statements
- tool implementations for schema discovery and SQL execution
- the Connector instance used by the framework

All runtime behavior is implemented in the connector submodules; this module
is purposely lightweight and only provides a package-level docstring.
"""