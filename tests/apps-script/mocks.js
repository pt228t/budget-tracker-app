export class MockSheet {
  constructor(name, values = []) {
    this.name = name;
    this.values = values.map((row) => [...row]);
  }

  getName() {
    return this.name;
  }

  getDataRange() {
    return {
      getValues: () => this.values.map((row) => [...row]),
    };
  }

  appendRow(row) {
    this.values.push([...row]);
    return this;
  }

  clear() {
    this.values = [];
    return this;
  }
}

export class MockSpreadsheet {
  constructor(sheets = {}) {
    this.sheets = new Map(
      Object.entries(sheets).map(([name, values]) => [name, new MockSheet(name, values)])
    );
  }

  getSheetByName(name) {
    return this.sheets.get(name) || null;
  }

  insertSheet(name) {
    const sheet = new MockSheet(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
}

export function createMockSpreadsheetApp(spreadsheet) {
  return {
    getActiveSpreadsheet() {
      return spreadsheet;
    },
  };
}
