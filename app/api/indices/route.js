import { getCombinedIndicesData, formatIndicesMarkdown } from '@/lib/indicesData';

export const revalidate = 21600; // 6 hours

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get('format');
    const accept = request.headers.get('accept') || '';

    const data = await getCombinedIndicesData();

    if (format === 'md' || format === 'markdown' || accept.includes('text/markdown')) {
      const markdown = formatIndicesMarkdown(data);
      return new Response(markdown, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return Response.json(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('[api/indices] Error:', err);
    return Response.json(
      { error: 'Failed to retrieve indices data', details: err.message },
      { status: 500 }
    );
  }
}
