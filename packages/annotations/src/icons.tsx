import React from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Comment01Icon, HelpCircleIcon, Idea01Icon, Delete02Icon, SmileIcon, HighlighterIcon,
  Tick02Icon, CheckmarkSquare01Icon, ReplyIcon, Link01Icon, Edit02Icon, CheckmarkCircle02Icon,
  Cancel01Icon, Share08Icon, Menu01Icon, Moon02Icon, Sun03Icon, ContrastIcon, File01Icon,
  CodeSquareIcon, Download04Icon, GlobeIcon, LinkSquare02Icon, User03Icon, LeftToRightListBulletIcon,
  Folder01Icon, ComputerTerminal01Icon, SourceCodeIcon, RoboticIcon, FlashIcon, DashboardSquare01Icon,
  UndoIcon, Copy01Icon, ViewIcon, ViewOffIcon, Alert02Icon,
  GitBranchIcon, Clock01Icon, FullScreenIcon, SidebarRightIcon, SidebarLeftIcon, PrinterIcon, KeyboardIcon,
  Upload04Icon, Login01Icon, ArrowLeft01Icon, ArrowDown01Icon, FolderOpenIcon, Search01Icon, MoreHorizontalIcon,
  FileExportIcon, PdfIcon, Add01Icon, Refresh01Icon, NotificationOff01Icon, Settings02Icon, GithubIcon, ArrowRight01Icon,
} from '@hugeicons/core-free-icons';

export const ANNOTATION_TYPES: Record<string, { label: string; colorVar: string; letter: string }> = {
  comment:    { label: 'Comment',  colorVar: '--comment',    letter: 'C' },
  deletion:   { label: 'Delete',   colorVar: '--danger',     letter: 'D' },
  suggestion: { label: 'Suggest',  colorVar: '--teal',       letter: 'S' },
  question:   { label: 'Question', colorVar: '--question',   letter: 'Q' },
  emoji:      { label: 'Reaction', colorVar: '--text-muted', letter: 'E' },
};

// ── Icon system: Hugeicons ───────────────────────────────────────────────────
// One registry shared across the whole product (annotations, toolbar, app chrome,
// marketing site). Call sites pass a stable semantic `name`; swapping the icon
// set later is a one-file change. SCALE nudges every glyph up a touch.
const REGISTRY: Record<string, Parameters<typeof HugeiconsIcon>[0]['icon']> = {
  // annotation types
  chat_bubble: Comment01Icon,
  help: HelpCircleIcon,
  lightbulb: Idea01Icon,
  delete: Delete02Icon,
  mood: SmileIcon,
  ink_highlighter: HighlighterIcon,
  check: Tick02Icon,
  check_box: CheckmarkSquare01Icon,
  // comment card actions
  add_reaction: SmileIcon,
  reply: ReplyIcon,
  link: Link01Icon,
  edit: Edit02Icon,
  check_circle: CheckmarkCircle02Icon,
  close: Cancel01Icon,
  // app chrome
  share: Share08Icon,
  menu: Menu01Icon,
  dark_mode: Moon02Icon,
  light_mode: Sun03Icon,
  brightness_auto: ContrastIcon,
  markdown: File01Icon,
  data_object: CodeSquareIcon,
  download: Download04Icon,
  language: GlobeIcon,
  open_in_new: LinkSquare02Icon,
  person: User03Icon,
  login: Login01Icon,
  format_list_bulleted: LeftToRightListBulletIcon,
  folder: Folder01Icon,
  description: File01Icon,
  // marketing / misc
  terminal: ComputerTerminal01Icon,
  code: SourceCodeIcon,
  smart_toy: RoboticIcon,
  bolt: FlashIcon,
  space_dashboard: DashboardSquare01Icon,
  undo: UndoIcon,
  content_copy: Copy01Icon,
  visibility: ViewIcon,
  visibility_off: ViewOffIcon,
  warning: Alert02Icon,
  history: GitBranchIcon,
  schedule: Clock01Icon,
  fullscreen: FullScreenIcon,
  panel_right: SidebarRightIcon,
  panel_left: SidebarLeftIcon,
  print: PrinterIcon,
  keyboard: KeyboardIcon,
  upload: Upload04Icon,
  arrow_back: ArrowLeft01Icon,
  expand_more: ArrowDown01Icon,
  folder_open: FolderOpenIcon,
  search: Search01Icon,
  more_horiz: MoreHorizontalIcon,
  export: FileExportIcon,
  pdf: PdfIcon,
  add: Add01Icon,
  refresh: Refresh01Icon,
  notifications_off: NotificationOff01Icon,
  settings: Settings02Icon,
  github: GithubIcon,
  arrow_right: ArrowRight01Icon,
  arrow_down: ArrowDown01Icon,
};

const SCALE = 1.05;

interface IconProps {
  name: string;
  size?: number;
  /** Accepted for call-site compatibility; Hugeicons glyphs don't use them. */
  fill?: boolean;
  weight?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
  className?: string;
}
export const Icon: React.FC<IconProps> = ({ name, size = 16, color, strokeWidth, style, className }) => (
  <HugeiconsIcon
    icon={REGISTRY[name] ?? Comment01Icon}
    size={Math.round(size * SCALE)}
    color={color ?? 'currentColor'}
    strokeWidth={strokeWidth ?? 1.8}
    className={className}
    style={{ flexShrink: 0, ...style }}
  />
);

// Annotation type → registry key.
const LIGATURES: Record<string, string> = {
  comment:       'chat_bubble',
  question:      'help',
  suggestion:    'lightbulb',
  deletion:      'delete',
  emoji:         'mood',
  highlight:     'ink_highlighter',
  approval:      'check',
  'action-item': 'check_box',
};

export const CustomIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 12 }) => (
  <Icon name={LIGATURES[type] ?? 'chat_bubble'} size={size} />
);

export const AnnoIcon: React.FC<{ type: string; size?: number }> = ({ type, size = 12 }) => {
  const meta = ANNOTATION_TYPES[type] ?? ANNOTATION_TYPES['comment'];
  return (
    <span style={{ color: `var(${meta.colorVar})`, display: 'inline-flex', alignItems: 'center' }}>
      <CustomIcon type={type} size={size} />
    </span>
  );
};
