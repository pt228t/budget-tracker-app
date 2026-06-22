export class MockSheet {
  constructor(name, values = []) {
    this.name = name;
    // values[0] is the header row; values[1..] are data rows
    this.values = values.map((row) => [...row]);
  }

  getName() {
    return this.name;
  }

  /** Returns all rows including header as 2D array. */
  getDataRange() {
    return {
      getValues: () => this.values.map((row) => [...row]),
    };
  }

  /** Returns all data rows (skips header row 0). */
  getDataRows() {
    return this.values.slice(1).map((row) => [...row]);
  }

  /** Returns 1-based count of all rows (including header). */
  getLastRow() {
    return this.values.length;
  }

  /**
   * Minimal getRange stub: getRange(startRow, startCol, numRows, numCols)
   * startRow is 1-based.
   */
  getRange(startRow, startCol, numRows, numCols) {
    const rows = this.values
      .slice(startRow - 1, startRow - 1 + (numRows ?? 1))
      .map(row => row.slice(startCol - 1, startCol - 1 + (numCols ?? row.length)));
    return {
      getValues: () => rows,
      setValue: (val) => {
        if (this.values[startRow - 1]) {
          this.values[startRow - 1][startCol - 1] = val;
        }
      },
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
