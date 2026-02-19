import { getDb } from '../../../lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT week, video_id, creator, product, gmv, orders, items_sold, commission, video_title
      FROM affiliate_records
      ORDER BY week, creator
    `;

    const weekMap = {};
    for (const row of rows) {
      if (!weekMap[row.week]) weekMap[row.week] = [];
      weekMap[row.week].push({
        video_id: row.video_id,
        creator: row.creator,
        product: row.product,
        gmv: parseFloat(row.gmv),
        orders: row.orders,
        items_sold: row.items_sold,
        commission: parseFloat(row.commission),
        video_title: row.video_title,
      });
    }

    const weeksData = Object.entries(weekMap)
      .map(([week, records]) => ({ week, records }))
      .sort((a, b) => new Date(a.week) - new Date(b.week));

    return NextResponse.json(weeksData);
  } catch (error) {
    console.error('GET /api/weeks error:', error);
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request) {
  try {
    const sql = getDb();
    const { week, records } = await request.json();

    await sql`DELETE FROM affiliate_records WHERE week = ${week}`;

    for (const r of records) {
      await sql`
        INSERT INTO affiliate_records (week, video_id, creator, product, gmv, orders, items_sold, commission, video_title)
        VALUES (${week}, ${r.video_id}, ${r.creator}, ${r.product}, ${r.gmv}, ${r.orders}, ${r.items_sold}, ${r.commission}, ${r.video_title})
      `;
    }

    return NextResponse.json({ success: true, count: records.length });
  } catch (error) {
    console.error('POST /api/weeks error:', error);
    return NextResponse.json({ error: 'Failed to import data' }, { status: 500 });
  }
}
