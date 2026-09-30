# ResultMoment

The centred payoff after an action: one big emoji, a short exclamation, one sentence, then the buttons.

Four moments exist, each with its own emoji. Don't invent more.
- 📝 **Penciled in!** "Now send the invite. Anyone who opens the link joins the plan — and if they secretly want out, they can tap flake." Then Send to group (iOS) / Share invite (web) / Copy link / Send individually.
- 🙌 **You're in!** After joining from an invite link: "Plans with Asher E. on Fri, 2 Oct. If you secretly want out, tap flake — nobody finds out unless everyone does."
- 🤫 **Secret's safe** "If everyone wants out, you'll all be off the hook."
- 🛋️ **It's mutual!** One line from the mutual-cancel pool, e.g. "Your couch was hoping you'd stay. Wish granted." Button says "Nice".

The invite page (`/m/<id>`) uses the same shape: 📝 "You're invited" with a Join this plan button, 🛋️ "This one's off" once everyone has flaked, 🌫️ "Invite not found".
The emoji is the illustration; flaky has no other imagery.

_Implemented inline in `src/app/page.tsx` and `src/app/m/[id]/page.tsx`._
