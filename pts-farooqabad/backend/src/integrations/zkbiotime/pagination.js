function apiRows(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.results)) return response.results;
  if (Array.isArray(response?.data?.results)) return response.data.results;
  throw new Error("Unexpected BioTime response: expected an employee/transaction array.");
}
function apiCount(response) {
  const value = response?.count ?? response?.total ?? response?.data?.count;
  return value == null ? null : Number(value);
}
async function* apiPages(fetchPage, params = {}, pageSize = 100) {
  let received = 0;
  const signatures = new Set();
  for (let page = 1; page <= 100000; page++) {
    const response = await fetchPage({ ...params, page, page_size: pageSize });
    const rows = apiRows(response), total = apiCount(response);
    if (!rows.length) {
      if (total != null && received < total) throw new Error(`BioTime pagination incomplete: received ${received} of ${total}.`);
      return;
    }
    const signature = JSON.stringify(rows.map(row => row.id ?? row.pk ?? row.transaction_id ?? row.emp_code));
    if (signatures.has(signature)) throw new Error("BioTime repeated a page; sync stopped instead of reporting incomplete data as complete.");
    signatures.add(signature);
    received += rows.length;
    yield { rows, total, page, received };
    if (total != null && received >= total) return;
    if (Object.prototype.hasOwnProperty.call(response, "next") && !response.next) {
      if (total != null && received < total) throw new Error(`BioTime pagination incomplete: received ${received} of ${total}.`);
      return;
    }
    // A server may cap page_size. A short page alone never means completion.
  }
  throw new Error("BioTime pagination safety limit exceeded.");
}
module.exports = { apiRows, apiCount, apiPages };
