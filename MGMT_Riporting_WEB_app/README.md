# MGM Reporting Codex

Helyi hálózaton futtatható, egygépes pénzügyi riportáló webalkalmazás.

## Indítás

1. Nyisd meg a `start.bat` fájlt.
2. A szerver kiírja a helyi címet és a hálózati IP-címet.
3. Ugyanezen a gépen: `http://localhost:3002`
4. Másik gépen a helyi hálózaton: a kiírt `http://IP-CIM:3002`

Alap belépés:

```text
admin / Admin123!
```

Éles használat előtt a Profil oldalon cseréld le az alap jelszót.

## Mit tartalmaz az első verzió?

- Bejelentkezés és szerepkörök: SA, Admin, User, Viewer
- Többcégű működés
- Számlatükör import XLSX/CSV/TXT fájlból
- GL import XLSX/CSV/TXT fájlból
- Árfolyam kézi karbantartás és havi seed adatok
- Budget / Forecast import XLSX/CSV/TXT fájlból
- BS / PL riport YTD, PY, BUD és FCST oszlopokkal
- Admin napló
- SQLite adatbázis és manuális backup
- Helyi licenszkulcs generálás és aktiválás

## Adatbázis

Az adatbázis automatikusan létrejön itt:

```text
data/mgm.db
```

A backup fájlok ide kerülnek:

```text
data/backup/
```

## Import minták

Az import képernyők `.xlsx`, `.csv` és `.txt` fájlokat fogadnak. XLSX esetén az első munkalapot olvassa a rendszer, az első nem üres sort fejlécnek veszi.

A számlatükör import felismeri a gyakori ügyviteli export mezőket is: `FOKSZAM`, `MEGNEV`, `TIPUS`, `ERVENYES`, `TipusNev`, `MegjelolNev`. Az `ERVENYES=N` sorokat alapból szabály alapján kihagyja.

COA:

```csv
gl_number;gl_name;cons_account;reporting_category;statement_type
4000;Revenue;Revenue;Revenue;PL
6000;Operating expenses;Opex;Operating Expenses;PL
```

GL:

```csv
gl_number;gl_name;amount
4000;Revenue;1250000
6000;Operating expenses;-420000
```

Budget / Forecast:

```csv
month;gl_number;amount
1;4000;1000000
1;6000;-350000
```

## Fontos

Ha másik gépről nem nyílik meg, akkor a Windows tűzfalon engedélyezni kell a Node.js-t vagy a 3002-es portot a privát helyi hálózaton.
