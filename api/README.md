# Duck Club Event Dashboard API

The API runs as Azure Functions inside the Azure Static Web App.

## Azure Storage

The API stores events in the `DuckClubEvents` Azure Table and event items/tasks in the `DuckClubTasks` Azure Table.

Configure one of these application settings in the Static Web App: `DUCKCLUB_STORAGE_CONNECTION` (recommended), `AZURE_STORAGE_CONNECTION_STRING`, or `AzureWebJobsStorage`.

The frontend uses `/api/data` to load and save the complete event dashboard.
