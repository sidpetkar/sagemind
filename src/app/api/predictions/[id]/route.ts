import { NextResponse } from 'next/server';
import Replicate from 'replicate';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  
  if (!id) {
    return NextResponse.json({ error: 'Prediction ID is required' }, { status: 400 });
  }

  try {
    const prediction = await replicate.predictions.get(id);
    
    if (prediction.error) {
        return NextResponse.json({ detail: prediction.error }, { status: 500 });
    }

    return NextResponse.json(prediction, { status: 200 });

  } catch (error) {
    console.error(`Error fetching prediction ${id}:`, error);
    return NextResponse.json({ detail: 'Failed to fetch prediction status.' }, { status: 500 });
  }
} 