# UnderlineInput

Borderless text input on a 2px `line-input` underline that turns `terracotta` on focus; the only field style in flaky.

- Two label tones. A field that stands alone gets a legend-tone label (`label` style, `ink-2`): "Your mobile number", "Verification code". A field inside a section headed by a question gets a field-tone label (`field-label`, `muted`): the section says "Who are you meeting?" in `ink-2`, the field under it says "Their number" in `muted`.
- Value in `input-lg` (`ink`), placeholder in `placeholder`.
- The code variant, for the 6-digit SMS code: 24px, centred, 0.3em tracking, placeholder "123456".
- Optional `hint` under the field in `muted` (used for a contact's saved name under their number).
- No boxes, no fills. The card is the container; inputs are lines on paper.

_Implemented inline in `src/app/page.tsx`._
