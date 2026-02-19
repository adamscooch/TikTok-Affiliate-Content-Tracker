import { getDb } from '../../../lib/db';
import { NextResponse } from 'next/server';
import { SAMPLE_DATA } from '../../../lib/sample-data';

export async function POST() {
  try {
    const sql = getDb();

    await sql`
      CREATE TABLE IF NOT EXISTS affiliate_records (
        id SERIAL PRIMARY KEY,
        week VARCHAR(20) NOT NULL,
        video_id VARCHAR(50) NOT NULL,
        creator VARCHAR(100) NOT NULL,
        product VARCHAR(200) NOT NULL,
        gmv DECIMAL(12,2) DEFAULT 0,
        orders INTEGER DEFAULT 0,
        items_sold INTEGER DEFAULT 0,
        commission DECIMAL(12,2) DEFAULT 0,
        video_title VARCHAR(300) DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Clear existing data and re-seed
    await sql`DELETE FROM affiliate_records`;

    for (const wd of SAMPLE_DATA) {
      for (const r of wd.records) {
        await sql`
          INSERT INTO affiliate_records (week, video_id, creator, product, gmv, orders, items_sold, commission, video_title)
          VALUES (${wd.week}, ${r.video_id}, ${r.creator}, ${r.product}, ${r.gmv}, ${r.orders}, ${r.items_sold}, ${r.commission}, ${r.video_title})
        `;
      }
    }

    return NextResponse.json({ success: true, message: 'Database seeded with sample data' });
  } catch (error) {
    console.error('POST /api/seed error:', error);
    return NextResponse.json({ error: 'Failed to seed database' }, { status: 500 });
  }
}
