const messages = [
  "Sometimes the best plans are cancelled plans.",
  "Great minds think alike — tonight they're thinking about pyjamas.",
  "Plot twist: you both wanted to cancel. The sofa sends its regards.",
  "The universe wanted you both to have a quiet night in.",
  "You're officially off the hook. Both of you. Enjoy the quiet.",
  "Turns out, you were both secretly rooting for a night in.",
  "Congratulations — you've unlocked a guilt-free evening.",
  "The stars aligned for a cosy night. Who are we to argue?",
  "Two people just chose comfort over FOMO. Respect.",
  "Your couch was hoping you'd stay. Wish granted.",
];

export function getRandomMessage(): string {
  return messages[Math.floor(Math.random() * messages.length)];
}
