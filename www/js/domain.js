export const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const categoryModules = category => category === 'personal' ? ['loans','reports'] : category === 'hybrid' ? ['khata','pos','stock','loans','reports'] : ['khata','pos','stock','reports'];
export const expenseCategories = ['Mobile / Internet','Food / Groceries','Doctor / Medicine','Clothing','Transport / Petrol','Friends / Gatherings','Rent / Bills','Education','Family','Charity','Other'];
export function personalTotals(loans, income, expenses, month = localDateKey().slice(0,7)) {
  const live = loans.filter(x=>!x.deletedAt);
  const total = rows => rows.filter(x=>!x.deletedAt && String(x.date||x.createdAtISO||'').startsWith(month)).reduce((sum,x)=>sum+Number(x.amount||0),0);
  const earned = total(income), spent = total(expenses);
  return {receivable:live.filter(x=>x.type==='lent').reduce((s,x)=>s+Number(x.outstanding||0),0),payable:live.filter(x=>x.type==='borrowed').reduce((s,x)=>s+Number(x.outstanding||0),0),income:earned,expenses:spent,savings:earned-spent};
}
export function aggregateSaleLines(lines) {
  const quantities = new Map();
  for(const line of lines) {
    if(!line.stockId || !Number.isFinite(line.qty) || line.qty<=0 || !Number.isFinite(line.rate) || line.rate<0) throw new Error('Item, quantity aur rate check karein');
    quantities.set(line.stockId,(quantities.get(line.stockId)||0)+line.qty);
  }
  return quantities;
}
