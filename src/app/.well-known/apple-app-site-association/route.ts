import { NextResponse } from "next/server";

/**
 * Universal links: lets iOS open invite links (flaky.me/m/<id>) straight in
 * the app when it's installed, instead of Safari. Only invite links — every
 * other flaky.me URL keeps opening in the browser.
 */
export function GET() {
  return NextResponse.json({
    applinks: {
      details: [
        {
          appIDs: ["4388F572W9.app.flaky.ios"],
          components: [{ "/": "/m/*", comment: "Plan invite links" }],
        },
      ],
    },
  });
}
