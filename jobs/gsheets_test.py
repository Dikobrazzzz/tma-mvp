import os.path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Если меняете scopes, удалите token.json.
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

CREDS_FILE = "/opt/tma-mvp/credentials.json"
TOKEN_FILE = "/opt/tma-mvp/token.json"

def main():
    """Создаёт новую таблицу и записывает в неё пример данных."""
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                CREDS_FILE, SCOPES)
            creds = flow.run_console()  # Консольный ввод для headless-окружения

        with open(TOKEN_FILE, "w") as token:
            token.write(creds.to_json())

    try:
        service = build("sheets", "v4", credentials=creds)

        # Создание новой таблицы
        spreadsheet = {
            "properties": {
                "title": "Test Spreadsheet"
            }
        }
        spreadsheet = service.spreadsheets().create(
            body=spreadsheet, fields="spreadsheetId"
        ).execute()
        spreadsheet_id = spreadsheet.get("spreadsheetId")
        print(f"Spreadsheet ID: {spreadsheet_id}")

        # Запись примерных данных
        values = [
            ["Item", "Cost", "Stocked", "Ship Date"],
            ["Wheel", "$20.50", "4", "3/1/2016"],
            ["Door", "$15", "2", "3/15/2016"],
            ["Engine", "$100", "1", "3/20/2016"],
            ["Totals", "=SUM(B2:B4)", "=SUM(C2:C4)", "=MAX(D2:D4)"]
        ]
        body = {"values": values}
        result = (
            service.spreadsheets()
            .values()
            .update(
                spreadsheetId=spreadsheet_id,
                range="Sheet1!A1",
                valueInputOption="USER_ENTERED",
                body=body,
            )
            .execute()
        )
        print(f"{result.get('updatedCells')} cells updated.")

    except HttpError as err:
        print(err)

if __name__ == "__main__":
    main()
