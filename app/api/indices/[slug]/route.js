import { getIndexDetail, formatIndexMarkdown } from '@/lib/indexConstituents';

export const revalidate = 21600; // 6 hours

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const slug = (resolvedParams?.slug || '').toLowerCase();

    const detail = await getIndexDetail(slug);
    if (!detail) {
      return Response.json(
        { error: `Benchmark index with slug '${slug}' not found` },
        { status: 404 }
      );
    }

    const url = new URL(request.url);
    const format = url.searchParams.get('format');
    const accept = request.headers.get('accept') || '';

    if (format === 'md' || format === 'markdown' || accept.includes('text/markdown')) {
      const markdown = formatIndexMarkdown(detail);
      return new Response(markdown, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return Response.json(detail, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error(`[api/indices/[slug]] Error:`, err);
    return Response.json(
      { error: 'Failed to retrieve index detail', details: err.message },
      { status: 500 }
    );
  }
}
