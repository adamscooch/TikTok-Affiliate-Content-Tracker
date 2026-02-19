export const parseMoney = (val) => {
  if (!val) return 0;
  if (typeof val === "number") return val;
  return parseFloat(String(val).replace(/[$,]/g, "")) || 0;
};

export const parseNum = (val) => {
  if (!val) return 0;
  return parseInt(String(val).replace(/,/g, ""), 10) || 0;
};

export const parseTSV = (text) => {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    if (cols.length < 12) continue;
    rows.push({
      video_title: cols[0]?.trim() || "",
      video_id: cols[1]?.trim() || "",
      post_date: cols[2]?.trim() || "",
      video_link: cols[3]?.trim() || "",
      creator: cols[4]?.trim() || "",
      product: cols[5]?.trim() || "",
      product_id: cols[6]?.trim() || "",
      gmv: parseMoney(cols[7]),
      orders: parseNum(cols[8]),
      aov: parseMoney(cols[9]),
      avg_gmv_customer: parseMoney(cols[10]),
      items_sold: parseNum(cols[11]),
      refunds: parseMoney(cols[12]),
      items_refunded: parseNum(cols[13]),
      commission: parseMoney(cols[14]),
      flat_fee: parseMoney(cols[15]),
    });
  }
  return rows;
};
