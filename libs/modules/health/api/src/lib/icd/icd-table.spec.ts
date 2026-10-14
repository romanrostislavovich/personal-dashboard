import { csvRows, icdTable } from './icd-table';

describe('icdTable', () => {
  it('finds the codes and the titles whatever the columns are called', () => {
    // As the Russian dictionary of the Ministry of Health has it: an id, a code, a title, a parent.
    const rows = [
      ['ID', 'MKB_CODE', 'MKB_NAME', 'ID_PARENT', 'ACTUAL'],
      ['1', 'A00-B99', 'Некоторые инфекционные и паразитарные болезни', '', '1'],
      ['5', 'F41', 'Другие тревожные расстройства', '4', '1'],
      ['6', 'F41.1', 'Генерализованное тревожное расстройство', '5', '1'],
      ['7', 'F41.1', 'Повтор', '5', '1'],
      ['8', 'A17.0†', 'Туберкулезный менингит', '3', '1'],
    ];
    expect(icdTable(rows)).toEqual([
      { code: 'F41', title: 'Другие тревожные расстройства' },
      { code: 'F41.1', title: 'Генерализованное тревожное расстройство' },
      { code: 'A17.0', title: 'Туберкулезный менингит' },
    ]);
  });

  it('takes the five characters of ICD-10-AM and the codes of ICD-11', () => {
    expect(
      icdTable([
        ['F41.10', 'Генералізований тривожний розлад'],
        ['6A70.1', 'Single episode depressive disorder, moderate'],
      ]),
    ).toEqual([
      { code: 'F41.10', title: 'Генералізований тривожний розлад' },
      { code: '6A70.1', title: 'Single episode depressive disorder, moderate' },
    ]);
  });

  it('gives nothing for a table without codes', () => {
    expect(
      icdTable([
        ['name', 'value'],
        ['apples', '3'],
      ]),
    ).toEqual([]);
    expect(icdTable([])).toEqual([]);
  });
});

describe('csvRows', () => {
  it('reads `;`-separated cells with quotes', () => {
    expect(csvRows('code;name\r\nF41.1;"Розлад; ""тривожний"""\n')).toEqual([
      ['code', 'name'],
      ['F41.1', 'Розлад; "тривожний"'],
    ]);
  });

  it('finds a comma or a tab between the cells', () => {
    expect(csvRows('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(csvRows('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});
