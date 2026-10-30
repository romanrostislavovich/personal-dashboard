import {generateKeyPairSync, createVerify} from 'node:crypto';
import {ProviderTransaction, signToken} from './enable-banking.client';
import {
  balanceOf,
  counterpartyKey,
  isOwnTransfer,
  matchOf,
  merchantOf,
  operationOf,
  operationsOf,
} from './bank-operations';

const card = (
  extra: Partial<ProviderTransaction> = {},
): ProviderTransaction => ({
  transaction_amount: {amount: '23.49', currency: 'PLN'},
  credit_debit_indicator: 'DBIT',
  status: 'BOOK',
  booking_date: '2026-10-15',
  creditor: {name: 'BIEDRONKA 1234   WARSZAWA'},
  remittance_information: ['Płatność kartą', '  15.10.2026 '],
  ...extra,
});

const IBAN = 'PL61109010140000071219812874';

describe('bank operations', () => {
  it('takes a card payment as an expense to its shop', () => {
    expect(operationOf(card({entry_reference: 'E1'}))).toEqual({
      entryId: 'E1',
      kind: 'expense',
      amount: 23.49,
      currency: 'PLN',
      bookedOn: '2026-10-15',
      counterparty: 'BIEDRONKA 1234 WARSZAWA',
      counterpartyIban: null,
      note: 'Płatność kartą 15.10.2026',
    });
  });

  it('takes a credit as an income from who paid', () => {
    const salary = operationOf(
      card({
        credit_debit_indicator: 'CRDT',
        transaction_amount: {amount: '-8000.00', currency: 'pln'},
        debtor: {name: 'ACME Sp. z o.o.'},
        debtor_account: {iban: 'pl61 1090 1014 0000 0712 1981 2874'},
      }),
    );
    expect(salary).toMatchObject({
      kind: 'income',
      amount: 8000,
      currency: 'PLN',
      counterparty: 'ACME Sp. z o.o.',
      counterpartyIban: IBAN,
    });
  });

  it('leaves pending operations and empty ones out', () => {
    expect(operationOf(card({status: 'PDNG'}))).toBeNull();
    expect(
      operationOf(card({transaction_amount: {amount: '0', currency: 'PLN'}})),
    ).toBeNull();
    expect(
      operationOf(card({booking_date: null, value_date: null})),
    ).toBeNull();
  });

  it('gives an operation without an id of the bank the same id on every import', () => {
    const [first, second] = operationsOf([card(), card()]);
    expect(first.entryId).toMatch(/^h:[0-9a-f]{32}$/);
    // Two equal coffees of one day are two operations.
    expect(second.entryId).toBe(`${first.entryId}#1`);
    expect(operationsOf([card()])[0].entryId).toBe(first.entryId);
  });

  it('tells a transfer to an account of one’s own', () => {
    const transfer = operationOf(
      card({creditor_account: {iban: 'PL61 1090 1014 0000 0712 1981 2874'}}),
    );
    expect(transfer && isOwnTransfer(transfer, new Set([IBAN]))).toBe(true);
    const shop = operationOf(card());
    expect(shop && isOwnTransfer(shop, new Set([IBAN]))).toBe(false);
  });

  it('takes the shop of a card payment without a name from its title', () => {
    const payment = card({
      entry_reference: 'E9',
      creditor: null,
      remittance_information: ['WARSZAWAZABKA Z7500 K.1PL', 'CARD-PAYMENT'],
    });
    expect(operationOf(payment)).toMatchObject({
      counterparty: 'WARSZAWAZABKA Z7500 K.1PL',
      note: 'WARSZAWAZABKA Z7500 K.1PL CARD-PAYMENT',
    });
    expect(merchantOf('WarszawaSam PlusPL CARD-PAYMENT')).toBe(
      'WarszawaSam PlusPL',
    );
    expect(merchantOf('1500 TRANSFER-IN')).toBeNull();
    expect(merchantOf(null)).toBeNull();
  });

  it('shows an account with what can be spent, else what is booked', () => {
    const balance = (type: string, amount: string) => ({
      balance_type: type,
      balance_amount: {amount, currency: 'pln'},
    });
    expect(
      balanceOf([balance('CLBD', '100.00'), balance('ITAV', '95.505')]),
    ).toEqual({
      amount: 95.51,
      currency: 'PLN',
    });
    expect(
      balanceOf([balance('XXXX', '7'), balance('CLBD', '100')])?.amount,
    ).toBe(100);
    expect(balanceOf([balance('ITAV', 'n/a')])).toBeNull();
    expect(balanceOf([])).toBeNull();
  });

  it('knows one shop under its many names', () => {
    expect(counterpartyKey('BIEDRONKA 1234 WARSZAWA')).toBe(
      'biedronka warszawa',
    );
    expect(counterpartyKey('Biedronka 5678 Warszawa')).toBe(
      'biedronka warszawa',
    );
    expect(counterpartyKey('Żabka Z1234 K.1')).toBe('żabka');
    expect(counterpartyKey('1234')).toBeNull();
  });

  it('matches a transaction typed by hand a day apart at most, the nearest first', () => {
    const operation = operationOf(card({entry_reference: 'E1'}));
    const typed = (id: string, occurredOn: string, amount = 23.49) => ({
      id,
      kind: 'expense' as const,
      amount,
      currency: 'PLN',
      occurredOn,
    });
    if (!operation) {
      throw new Error('no operation');
    }
    expect(
      matchOf(operation, [typed('a', '2026-10-14'), typed('b', '2026-10-15')])
        ?.id,
    ).toBe('b');
    expect(matchOf(operation, [typed('a', '2026-10-13')])).toBeNull();
    expect(matchOf(operation, [typed('a', '2026-10-15', 23.5)])).toBeNull();
  });
});

describe('the token of Enable Banking', () => {
  it('is a JWT of the application, signed with its key', () => {
    const {privateKey, publicKey} = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const token = signToken(
      {
        appId: 'app-1',
        privateKey: privateKey
          .export({type: 'pkcs8', format: 'pem'})
          .toString(),
      },
      1_000,
    );
    const [header, body, signature] = token.split('.');
    const decode = (part: string) =>
      JSON.parse(Buffer.from(part, 'base64url').toString());
    expect(decode(header)).toEqual({typ: 'JWT', alg: 'RS256', kid: 'app-1'});
    expect(decode(body)).toEqual({
      iss: 'enablebanking.com',
      aud: 'api.enablebanking.com',
      iat: 1_000,
      exp: 4_600,
    });
    const valid = createVerify('RSA-SHA256')
      .update(`${header}.${body}`)
      .verify(publicKey, Buffer.from(signature, 'base64url'));
    expect(valid).toBe(true);
  });
});
