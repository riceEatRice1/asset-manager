// Database layer using Dexie.js (loaded as UMD global)

const db = new Dexie('AssetManagerDB');

db.version(1).stores({
  accounts: '++id, order, type, isArchived',
  records: '++id, accountId, date, [accountId+date]'
});

// ========== Account Operations ==========

export async function getAllActiveAccounts() {
  return db.accounts
    .where('isArchived')
    .equals(0) // Dexie stores booleans as 0/1
    .sortBy('order');
}

export async function getAllAccounts() {
  return db.accounts.orderBy('order').toArray();
}

export async function getAccount(id) {
  return db.accounts.get(id);
}

export async function addAccount({ name, type, icon, color }) {
  // Check if account with same name and type already exists
  const allAccounts = await db.accounts.toArray();
  const existing = allAccounts.find(acc => acc.name === name && acc.type === type);
  
  if (existing) {
    throw new Error('同类型账户已存在：' + name);
  }

  const maxOrder = await db.accounts.orderBy('order').last();
  const order = maxOrder ? maxOrder.order + 1 : 0;
  return db.accounts.add({
    name,
    type,
    color,
    order,
    createdAt: Date.now(),
    isArchived: 0
  });
}

export async function updateAccount(id, changes) {
  // If name is being updated, check for duplicates
  if (changes.name) {
    const account = await db.accounts.get(id);
    if (account) {
      const allAccounts = await db.accounts.toArray();
      const existing = allAccounts.find(acc => acc.name === changes.name && acc.type === account.type && acc.id !== id);
      
      if (existing) {
        throw new Error('同类型账户已存在：' + changes.name);
      }
    }
  }
  
  return db.accounts.update(id, changes);
}

export async function archiveAccount(id) {
  return db.accounts.update(id, { isArchived: 1 });
}

export async function restoreAccount(id) {
  return db.accounts.update(id, { isArchived: 0 });
}

export async function deleteAccountPermanently(id) {
  await db.transaction('rw', [db.accounts, db.records], async () => {
    await db.records.where('accountId').equals(id).delete();
    await db.accounts.delete(id);
  });
}

export async function reorderAccounts(orderedIds) {
  await db.transaction('rw', db.accounts, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.accounts.update(orderedIds[i], { order: i });
    }
  });
}

// ========== Record Operations ==========

export async function upsertRecord(accountId, date, balanceCents, note = '') {
  const existing = await db.records
    .where('[accountId+date]')
    .equals([accountId, date])
    .first();

  const now = Date.now();

  if (existing) {
    return db.records.update(existing.id, {
      balance: balanceCents,
      note,
      updatedAt: now
    });
  } else {
    return db.records.add({
      accountId,
      date,
      balance: balanceCents,
      note,
      createdAt: now,
      updatedAt: now
    });
  }
}

export async function getRecordsForDate(date) {
  return db.records.where('date').equals(date).toArray();
}

export async function getRecordHistory(accountId, startDate, endDate) {
  return db.records
    .where('[accountId+date]')
    .between([accountId, startDate], [accountId, endDate], true, true)
    .toArray();
}

// Get the latest balance for an account on or before a given date
export async function getLatestBalance(accountId, date) {
  const record = await db.records
    .where('[accountId+date]')
    .between([accountId, Dexie.minKey], [accountId, date], true, true)
    .last();
  return record ? record.balance : null;
}

// Get the latest record for each active account
export async function getLatestRecordPerAccount() {
  const accounts = await getAllActiveAccounts();
  const today = new Date().toISOString().slice(0, 10);
  const result = [];

  for (const account of accounts) {
    const record = await db.records
      .where('[accountId+date]')
      .between([account.id, Dexie.minKey], [account.id, today], true, true)
      .last();

    result.push({
      account,
      balance: record ? record.balance : null,
      date: record ? record.date : null
    });
  }

  return result;
}

// Get previous balance before a specific date for an account
export async function getPreviousBalance(accountId, date) {
  // Get the record with the largest date strictly less than the given date
  const record = await db.records
    .where('[accountId+date]')
    .between([accountId, Dexie.minKey], [accountId, date], true, false)
    .last();
  return record ? record.balance : null;
}

// Get the latest record (full record) for an account on or before a given date
export async function getLatestRecordBeforeDate(accountId, date) {
  const record = await db.records
    .where('[accountId+date]')
    .between([accountId, Dexie.minKey], [accountId, date], true, true)
    .last();
  return record ? { balance: record.balance, date: record.date } : null;
}

// Get daily net worth totals for a date range
export async function getDailyTotals(startDate, endDate) {
  const accounts = await getAllActiveAccounts();
  const allRecords = await db.records
    .where('date')
    .between(startDate, endDate, true, true)
    .toArray();

  // Also get the latest record before startDate for each account
  const startBalances = {};
  for (const account of accounts) {
    const record = await db.records
      .where('[accountId+date]')
      .between([account.id, Dexie.minKey], [account.id, startDate], true, false)
      .last();
    startBalances[account.id] = record ? record.balance : 0;
  }

  // Group records by date
  const recordsByDate = {};
  for (const r of allRecords) {
    if (!recordsByDate[r.date]) recordsByDate[r.date] = {};
    recordsByDate[r.date][r.accountId] = r.balance;
  }

  // Walk through each day
  const result = [];
  const currentBalances = { ...startBalances };
  let d = new Date(startDate);
  const end = new Date(endDate);

  while (d <= end) {
    const dateStr = d.toISOString().slice(0, 10);
    const dayRecords = recordsByDate[dateStr] || {};

    // Update balances with any records for this day
    for (const [accountId, balance] of Object.entries(dayRecords)) {
      currentBalances[parseInt(accountId)] = balance;
    }

    // Sum all balances
    let total = 0;
    for (const account of accounts) {
      total += currentBalances[account.id] || 0;
    }

    result.push({ date: dateStr, total });

    d.setDate(d.getDate() + 1);
  }

  return result;
}

// Get monthly aggregation for a year
export async function getMonthlyAggregation(year) {
  const months = [];
  for (let m = 0; m < 12; m++) {
    const monthStart = `${year}-${String(m + 1).padStart(2, '0')}-01`;
    const nextMonth = m === 11
      ? `${year + 1}-01-01`
      : `${year}-${String(m + 2).padStart(2, '0')}-01`;

    // Last day of month
    const lastDay = new Date(new Date(nextMonth).getTime() - 86400000)
      .toISOString().slice(0, 10);

    // Get net worth at end of month and start of month
    const accounts = await getAllActiveAccounts();
    let startTotal = 0;
    let endTotal = 0;

    for (const account of accounts) {
      const startBal = await getLatestBalance(account.id, monthStart);
      const endBal = await getLatestBalance(account.id, lastDay);
      startTotal += startBal || 0;
      endTotal += endBal || 0;
    }

    months.push({
      month: m + 1,
      label: `${m + 1}月`,
      startTotal,
      endTotal,
      surplus: endTotal - startTotal
    });
  }

  return months;
}

// Get all records for export
export async function getAllRecords() {
  return db.records.orderBy('date').toArray();
}

// Import records in bulk
export async function importRecords(recordsData) {
  await db.transaction('rw', db.records, async () => {
    for (const r of recordsData) {
      await upsertRecord(r.accountId, r.date, r.balance, r.note || '');
    }
  });
}

// Import accounts in bulk
export async function importAccounts(accountsData) {
  await db.transaction('rw', db.accounts, async () => {
    for (const a of accountsData) {
      const existing = await db.accounts.get(a.id);
      if (existing) {
        await db.accounts.update(a.id, a);
      } else {
        await db.accounts.add(a);
      }
    }
  });
}

// Get the total count of records
export async function getRecordCount() {
  return db.records.count();
}

// Get the first record date
export async function getFirstRecordDate() {
  const first = await db.records.orderBy('date').first();
  return first ? first.date : null;
}

export { db };
