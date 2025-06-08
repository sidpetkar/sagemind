import { NextResponse } from 'next/server';
import Replicate from 'replicate';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function GET(
  request: Request,
  context: { params: { id: string } }
) {
  const predictionId = context.params.id;
  if (!predictionId) {
    return NextResponse.json({ error: 'Prediction ID is required' }, { status: 400 });
  }

  try {
    const prediction = await replicate.predictions.get(predictionId);
    
    if (prediction.error) {
        return NextResponse.json({ detail: prediction.error }, { status: 500 });
    }

    return NextResponse.json(prediction, { status: 200 });

  } catch (error) {
    console.error(`Error fetching prediction ${predictionId}:`, error);
    return NextResponse.json({ detail: 'Failed to fetch prediction status.' }, { status: 500 });
  }
} 