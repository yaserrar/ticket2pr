import { route } from '~/server/http/route';
import { screenshotParams } from '~/schemas/card';
import { cardPreviewService } from '~/server/modules/preview/card-preview.service';

/** One screenshot of the card, as an image. */
export const GET = route({ params: screenshotParams }, async ({ params }) => {
  const png = await cardPreviewService.image(params.cardId, params.file);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' } });
});
