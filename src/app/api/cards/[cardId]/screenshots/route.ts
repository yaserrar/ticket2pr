import { route } from '~/server/http/route';
import { cardParams, retakeScreenshotsBody } from '~/schemas/card';
import { cardPreviewService } from '~/server/modules/preview/card-preview.service';

/** Retake the screenshots now (starts the app in the card's folder). */
export const POST = route({ params: cardParams, body: retakeScreenshotsBody }, ({ params, body }) => cardPreviewService.retake(params.cardId, body.pages));
