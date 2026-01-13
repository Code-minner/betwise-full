import { NextRequest, NextResponse } from 'next/server';
import { parseSlip } from '@/lib/slip-parser';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, bookmaker } = body;

    if (!text) {
      return NextResponse.json({
        success: false,
        error: 'No slip text provided',
      }, { status: 400 });
    }

    const result = parseSlip(text, bookmaker);

    return NextResponse.json({
      success: true,
      bookmaker: result.bookmaker,
      selections: result.selections,
      totalOdds: result.totalOdds,
    });
  } catch (error) {
    console.error('Parse slip error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to parse slip',
    }, { status: 500 });
  }
}
