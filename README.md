# Duck Club Event Dashboard

Event management dashboard for Duck Club events.

## Storage

The dashboard now uses the Azure Functions API and Azure Table Storage as its source of truth. The API creates these tables automatically:

- `DuckClubEvents`
- `DuckClubTasks`

Set the Azure Static Web App application setting `DUCKCLUB_STORAGE_CONNECTION` to the Azure Storage connection string. The API also accepts `AZURE_STORAGE_CONNECTION_STRING` or `AzureWebJobsStorage`.

The browser keeps a local cache as a fallback, but saves are sent to Azure Storage automatically.
