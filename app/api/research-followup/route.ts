import { NextRequest, NextResponse } from 'next/server';
import { handleFollowUp } from '@/lib/groq';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      question, 
      originalAnalysis,
      conversationHistory = [],
    } = body;

    if (!question) {
      return NextResponse.json({
        success: false,
        error: 'No question provided',
      }, { status: 400 });
    }

    // Default analysis if not provided
    const analysis = originalAnalysis || {
      verdict: 'LEAN',
      confidence: 50,
      keyPoints: [],
      risks: [],
    };

    try {
      const result = await handleFollowUp(
        analysis,
        question,
        conversationHistory
      );

      return NextResponse.json({
        success: true,
        answer: result.answer,
        followUpSuggestions: result.followUpSuggestions,
      });
    } catch (groqError) {
      console.error('Groq follow-up error:', groqError);
      
      return NextResponse.json({
        success: true,
        answer: 'I apologize, but I cannot process follow-up questions at the moment. Please try again later or rephrase your question.',
        followUpSuggestions: [
          'What are the key stats for this match?',
          'What are the main risks?',
          'Is there value in this bet?',
        ],
      });
    }
  } catch (error) {
    console.error('Follow-up error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process follow-up',
    }, { status: 500 });
  }
}
