import { labelled, parseAmount, parseDate, parsePkoStatement } from './pko-statement';

/** The CSV as iPKO gives it: Windows-1250, the details in unnamed columns that move. */
const CSV = [
  '"Data operacji","Data waluty","Typ transakcji","Kwota","Waluta","Saldo po transakcji","Opis transakcji","","","","","",""',
  '"2026-10-15","2026-10-15","Płatność kartą","-23,49","PLN","+1 234,56","Tytuł: 000498849 74230786288179215","Lokalizacja: Adres: BIEDRONKA 1234 Miasto: WARSZAWA Kraj: POLSKA","Data wykonania operacji: 2026-10-14","Oryginalna kwota operacji: 23,49 PLN","Numer karty: 425125******1234","",""',
  '"2026-10-15","2026-10-15","Płatność kartą","-23,49","PLN","+1 211,07","Tytuł: 000498849 74230786288179216","Lokalizacja: Adres: BIEDRONKA 1234 Miasto: WARSZAWA Kraj: POLSKA","","","","",""',
  '"2026-10-10","2026-10-10","Przelew na rachunek","+8 000,00","PLN","+9 234,56","Rachunek nadawcy: 61 1090 1014 0000 0712 1981 2874","Nazwa nadawcy: ACME SPÓŁKA Z O.O.","Adres nadawcy: UL. PROSTA 1 WARSZAWA","Tytuł: Wynagrodzenie 09/2026","","",""',
  '"2026-10-11","2026-10-11","Przelew własny","-500,00","PLN","+8 734,56","Rachunek odbiorcy: 02 1020 0000 0000 0000 0000 0000","Nazwa odbiorcy: JAN KOWALSKI","Tytuł: Oszczędności","","","",""',
].join('\r\n');

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<account-history>
  <search>
    <account>PL12 1020 1234 0000 0000 0000 0000</account>
    <date since="2026-10-01" to="2026-10-18"/>
  </search>
  <operations>
    <operation>
      <order-date>2026-10-16</order-date>
      <exec-date>2026-10-16</exec-date>
      <type>Płatność kartą</type>
      <description>Tytuł: 0001 Lokalizacja: Adres: ŻABKA Z1234 K.1 Miasto: KRAKÓW Kraj: POLSKA</description>
      <amount curr="PLN">-12.99</amount>
      <ending-balance curr="PLN">+1198.08</ending-balance>
    </operation>
    <operation>
      <order-date>2026-10-17</order-date>
      <exec-date>2026-10-17</exec-date>
      <type>Przelew z rachunku</type>
      <description>Rachunek odbiorcy: 11 2222 3333 4444 5555 6666 7777 Nazwa odbiorcy: PGE OBRÓT S.A. Tytuł: Faktura &amp; prąd</description>
      <amount curr="PLN">-180.00</amount>
      <ending-balance curr="PLN">+1018.08</ending-balance>
    </operation>
  </operations>
</account-history>`;

/** Encodes a text as Windows-1250 (the Polish letters of the samples only). */
function cp1250(text: string): Buffer {
  const map: Record<string, number> = {
    ą: 0xb9,
    ć: 0xe6,
    ę: 0xea,
    ł: 0xb3,
    ń: 0xf1,
    ó: 0xf3,
    ś: 0x9c,
    ź: 0x9f,
    ż: 0xbf,
    Ą: 0xa5,
    Ć: 0xc6,
    Ę: 0xca,
    Ł: 0xa3,
    Ń: 0xd1,
    Ó: 0xd3,
    Ś: 0x8c,
    Ź: 0x8f,
    Ż: 0xaf,
  };
  return Buffer.from([...text].map((char) => map[char] ?? char.charCodeAt(0)));
}

describe('parsePkoStatement', () => {
  it('reads the CSV of iPKO in Windows-1250', () => {
    const { operations } = parsePkoStatement(cp1250(CSV));
    expect(operations).toHaveLength(4);
    expect(operations[0]).toMatchObject({
      kind: 'expense',
      amount: 23.49,
      currency: 'PLN',
      bookedOn: '2026-10-15',
      counterparty: 'BIEDRONKA 1234',
      note: '000498849 74230786288179215',
    });
    expect(operations[2]).toMatchObject({
      kind: 'income',
      amount: 8000,
      counterparty: 'ACME SPÓŁKA Z O.O.',
      counterpartyIban: '61109010140000071219812874',
      note: 'Wynagrodzenie 09/2026',
    });
  });

  it('tells two equal payments of a day apart, the same on every export', () => {
    const first = parsePkoStatement(cp1250(CSV)).operations;
    const again = parsePkoStatement(Buffer.from(CSV, 'utf8')).operations;
    expect(first[0].entryId).not.toBe(first[1].entryId);
    expect(again.map((op) => op.entryId)).toEqual(first.map((op) => op.entryId));
  });

  it('marks a transfer to one’s own account by its type', () => {
    const own = parsePkoStatement(cp1250(CSV)).operations[3];
    expect(own.counterpartyIban).toBe('OWN');
    expect(parsePkoStatement(cp1250(CSV)).operations[0].counterpartyIban).toBeNull();
  });

  it('reads the XML of iPKO with the account it is of', () => {
    const { account, operations } = parsePkoStatement(Buffer.from(XML, 'utf8'));
    expect(account).toBe('PL12102012340000000000000000');
    expect(operations).toEqual([
      expect.objectContaining({
        kind: 'expense',
        amount: 12.99,
        bookedOn: '2026-10-16',
        counterparty: 'ŻABKA Z1234 K.1',
      }),
      expect.objectContaining({
        amount: 180,
        counterparty: 'PGE OBRÓT S.A.',
        counterpartyIban: '11222233334444555566667777',
        note: 'Faktura & prąd',
      }),
    ]);
  });

  it('refuses a file that is not a history of iPKO', () => {
    expect(() => parsePkoStatement(Buffer.from('a,b,c\n1,2,3'))).toThrow(/iPKO/);
  });
});

describe('the pieces of an iPKO line', () => {
  it('reads amounts and dates as iPKO writes them', () => {
    expect(parseAmount('-1 234,56')).toBe(-1234.56);
    expect(parseAmount('+1.234,56')).toBe(1234.56);
    expect(parseAmount('-23.49')).toBe(-23.49);
    expect(parseAmount('')).toBeNull();
    expect(parseDate('15.10.2026')).toBe('2026-10-15');
    expect(parseDate('2026-10-15')).toBe('2026-10-15');
  });

  it('splits the details by their labels', () => {
    const details = labelled('Lokalizacja: Adres: SHOP Miasto: X Kraj: PL Adres odbiorcy: Y');
    expect(details.get('adres')).toBe('SHOP');
    expect(details.get('adres odbiorcy')).toBe('Y');
    expect(details.has('lokalizacja')).toBe(false);
  });
});
