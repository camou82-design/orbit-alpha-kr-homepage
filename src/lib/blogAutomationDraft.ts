/**
 * Blog Automation UI 공유 타입 (생성은 서버 OpenAI API)
 */

export type BlogAutomationInputs = {
  topic: string;
  perspective: string;
  opinion: string;
  lifePoint: string;
  clickbaitTitles: boolean;
  infographic: boolean;
  threads: boolean;
};

export type BlogDraftBundle = {
  titles: [string, string, string];
  body: string;
  infographic: string | null;
  tags: string[];
  threadBodyStyle: string;
  threadTrafficStyle: string;
};
