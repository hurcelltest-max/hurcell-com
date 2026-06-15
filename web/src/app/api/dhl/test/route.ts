import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const dhlUsername = process.env.DHL_API_USERNAME;
    const dhlPassword = process.env.DHL_API_PASSWORD;

    if (!dhlUsername || !dhlPassword) {
      return NextResponse.json(
        { error: 'DHL API credentials (DHL_API_USERNAME / DHL_API_PASSWORD) are missing in environment variables.' },
        { status: 500 }
      );
    }

    // Use the DHL_API_BASE_URL environment variable, or query param, or fallback to sandbox
    const { searchParams } = new URL(req.url);
    const dhlBaseUrl = process.env.DHL_API_BASE_URL || searchParams.get('baseUrl') || 'https://api-sandbox.dhl.com/express/v1';

    console.log('Testing DHL Connection using environment credentials...');
    const authHeader = 'Basic ' + Buffer.from(`${dhlUsername}:${dhlPassword}`).toString('base64');

    // Call DHL tracking endpoint with dummy tracking number to verify connection/auth status
    const testUrl = `${dhlBaseUrl}/tracking?shipmentTrackingNumber=1234567890`;
    
    console.log(`Connecting to DHL Endpoint: ${testUrl}`);
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    const status = response.status;
    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = await response.text();
    }

    return NextResponse.json({
      status,
      url: testUrl,
      response: data
    });

  } catch (err: any) {
    console.error('DHL Connection Test failed:', err.message);
    return NextResponse.json(
      { error: 'DHL Connection failed', details: err.message },
      { status: 500 }
    );
  }
}
