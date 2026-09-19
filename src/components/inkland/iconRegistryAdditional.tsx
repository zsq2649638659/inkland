import type { InklandIconDefinition } from "./iconRegistry";

export type InklandAdditionalIconName =
  | "fa-align-center"
  | "fa-align-left"
  | "fa-align-right"
  | "fa-angles-left"
  | "fa-angles-right"
  | "fa-angles-down"
  | "fa-arrow-left"
  | "fa-arrow-right"
  | "fa-arrow-rotate-right"
  | "fa-arrow-down"
  | "fa-arrow-up"
  | "fa-arrow-up-from-bracket"
  | "fa-bell"
  | "fa-bold"
  | "fa-book"
  | "fa-book-open"
  | "fa-calendar"
  | "fa-calendar-days"
  | "fa-camera"
  | "fa-check"
  | "fa-chevron-down"
  | "fa-chevron-up"
  | "fa-circle"
  | "fa-circle-plus"
  | "fa-circle-user"
  | "fa-profile-settings"
  | "fa-profile-center"
  | "fa-circle-xmark"
  | "fa-clock"
  | "fa-clock-rotate-left"
  | "fa-cloud-arrow-up"
  | "fa-comment-dots"
  | "fa-compass"
  | "fa-compress"
  | "fa-crosshairs"
  | "fa-detail-back-to-top"
  | "fa-detail-font-adjust"
  | "fa-detail-line-height"
  | "fa-detail-more"
  | "fa-detail-night-mode"
  | "fa-detail-paragraph-spacing"
  | "fa-detail-page-width"
  | "fa-detail-report"
  | "fa-droplet"
  | "fa-ellipsis-vertical"
  | "fa-ellipsis-circle"
  | "fa-envelope"
  | "fa-expand"
  | "fa-eye"
  | "fa-eye-slash"
  | "fa-face-smile"
  | "fa-feather-pointed"
  | "fa-file-arrow-up"
  | "fa-file-import"
  | "fa-flag"
  | "fa-font"
  | "fa-gear"
  | "fa-hashtag"
  | "fa-hourglass-half"
  | "fa-house"
  | "fa-images"
  | "fa-italic"
  | "fa-link"
  | "fa-lock"
  | "fa-message"
  | "fa-minus"
  | "fa-moon"
  | "fa-paper-plane"
  | "fa-pen"
  | "fa-pencil"
  | "fa-power"
  | "fa-play"
  | "fa-repeat"
  | "fa-right-from-bracket"
  | "fa-right-to-bracket"
  | "fa-share-nodes"
  | "fa-rotate-left"
  | "fa-rotate-right"
  | "fa-shield-halved"
  | "fa-sparkles"
  | "fa-spinner"
  | "fa-strikethrough"
  | "fa-tag"
  | "fa-tag-heat"
  | "fa-tag-participants"
  | "fa-tag-works"
  | "fa-tags"
  | "fa-underline"
  | "fa-user"
  | "fa-user-check"
  | "fa-user-circle"
  | "fa-user-edit"
  | "fa-user-group"
  | "fa-user-favorite"
  | "fa-user-minus"
  | "fa-user-search"
  | "fa-followers"
  | "fa-user-shield"
  | "fa-users"
  | "fa-about-us"
  | "fa-contact-us"
  | "fa-wand-magic-sparkles"
  | "fa-workbench"
  | "fa-xmark"
  | "fa-tag-remove"
  | "fa-sun"
  | "fa-arrow-down-wide-short"
  | "fa-arrow-up-wide-short"
  | "fa-ellipsis"
  | "fa-filter"
  | "fa-fire"
  | "fa-clear-compact"
  | "fa-filter-compact"
  | "fa-list-compact"
  | "fa-card-compact"
  | "fa-list-check"
  | "fa-sliders"
  | "fa-action-preview-open"
  | "fa-action-edit"
  | "fa-action-delete"
  | "fa-action-forbid"
  | "fa-word-count";


export const inklandAdditionalIconRegistry: Record<InklandAdditionalIconName, InklandIconDefinition> = {
  "fa-angles-down": { viewBox: "0 0 384 512", paths: [
    { d: "M214.6 470.6c-12.5 12.5-32.8 12.5-45.3 0l-160-160c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L192 402.7 329.4 265.4c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3l-160 160zm160-352l-160 160c-12.5 12.5-32.8 12.5-45.3 0l-160-160c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L192 210.7 329.4 73.4c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3z", variant: "default", fill: "currentColor" },
  ], supportsVariants: false },
  "fa-share-nodes": { viewBox: "0 0 512 512", paths: [
    { d: "M384 192c53 0 96-43 96-96s-43-96-96-96-96 43-96 96c0 5.4 .5 10.8 1.3 16L159.6 184.1c-16.9-15-39.2-24.1-63.6-24.1-53 0-96 43-96 96s43 96 96 96c24.4 0 46.6-9.1 63.6-24.1L289.3 400c-.9 5.2-1.3 10.5-1.3 16 0 53 43 96 96 96s96-43 96-96-43-96-96-96c-24.4 0-46.6 9.1-63.6 24.1L190.7 272c.9-5.2 1.3-10.5 1.3-16s-.5-10.8-1.3-16l129.7-72.1c16.9 15 39.2 24.1 63.6 24.1z", variant: "default", fill: "currentColor" },
  ], supportsVariants: false },
  "fa-power": { viewBox: "0 0 48 48", paths: [
    { d: "M14.5 8C13.8406 8.37652 13.2062 8.79103 12.6 9.24051C11.5625 10.0097 10.6074 10.8814 9.75 11.8402C6.79377 15.1463 5 19.4891 5 24.2455C5 34.6033 13.5066 43 24 43C34.4934 43 43 34.6033 43 24.2455C43 19.4891 41.2062 15.1463 38.25 11.8402C37.3926 10.8814 36.4375 10.0097 35.4 9.24051C34.7938 8.79103 34.1594 8.37652 33.5 8", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 4V24", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-workbench": { viewBox: "0 0 48 48", paths: [
    { d: "M12 33H4V7H44V33H36H12Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M16 22V26", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 33V39", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 18V26", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M32 14V26", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M12 41H36", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-align-center": { viewBox: "0 0 48 48", paths: [
    { d: "M36 19H12", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 9H6", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 29H6", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M36 39H12", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-align-left": { viewBox: "0 0 48 48", paths: [
    { d: "M42 9H6", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M34 19H6", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 29H6", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M34 39H6", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-align-right": { viewBox: "0 0 48 48", paths: [
    { d: "M42 9H6", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 19H14", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 29H6", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 39H14", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-angles-left": { viewBox: "0 0 448 512", paths: [
    {"d":"M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256 214.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160zm352-160l-160 160c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L269.3 256 406.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-angles-right": { viewBox: "0 0 448 512", paths: [
    {"d":"M439.1 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L371.2 256 233.9 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160zm-352 160l160-160c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L179.2 256 41.9 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-arrow-left": { viewBox: "0 0 512 512", paths: [
    {"d":"M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 288 480 288c17.7 0 32-14.3 32-32s-14.3-32-32-32l-370.7 0 105.4-105.4c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-arrow-right": { viewBox: "0 0 512 512", paths: [
    {"d":"M502.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L402.7 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l370.7 0-105.4 105.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-arrow-rotate-right": { viewBox: "0 0 512 512", paths: [
    {"d":"M436.7 74.7L448 85.4 448 32c0-17.7 14.3-32 32-32s32 14.3 32 32l0 128c0 17.7-14.3 32-32 32l-128 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l47.9 0-7.6-7.2c-.2-.2-.4-.4-.6-.6-75-75-196.5-75-271.5 0s-75 196.5 0 271.5 196.5 75 271.5 0c8.2-8.2 15.5-16.9 21.9-26.1 10.1-14.5 30.1-18 44.6-7.9s18 30.1 7.9 44.6c-8.5 12.2-18.2 23.8-29.1 34.7-100 100-262.1 100-362 0S-25 175 75 75c99.9-99.9 261.7-100 361.7-.3z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-arrow-up": { viewBox: "0 0 384 512", paths: [
    {"d":"M214.6 9.4c-12.5-12.5-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 109.3 160 480c0 17.7 14.3 32 32 32s32-14.3 32-32l0-370.7 105.4 105.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-160-160z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-arrow-up-from-bracket": { viewBox: "0 0 448 512", paths: [
    {"d":"M246.6 9.4c-12.5-12.5-32.8-12.5-45.3 0l-128 128c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 109.3 192 320c0 17.7 14.3 32 32 32s32-14.3 32-32l0-210.7 73.4 73.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-128-128zM64 352c0-17.7-14.3-32-32-32S0 334.3 0 352l0 64c0 53 43 96 96 96l256 0c53 0 96-43 96-96l0-64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 64c0 17.7-14.3 32-32 32L96 448c-17.7 0-32-14.3-32-32l0-64z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-bell": { viewBox: "0 0 48 48", paths: [
    { d: "M24 4C16.268 4 10 10.268 10 18V38H38V18C38 10.268 31.732 4 24 4Z", variant: "default", fill: "none" },
    { d: "M10 38V18C10 10.268 16.268 4 24 4C31.732 4 38 10.268 38 18V38M4 38H44", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 44C26.7614 44 29 41.7614 29 39V38H19V39C19 41.7614 21.2386 44 24 44Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-bold": { viewBox: "0 0 48 48", paths: [
    { d: "M24 24C29.5056 24 33.9688 19.5228 33.9688 14C33.9688 8.47715 29.5056 4 24 4H11V24H24Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round", fillRule: "evenodd", clipRule: "evenodd" },
    { d: "M28.0312 44C33.5368 44 38 39.5228 38 34C38 28.4772 33.5368 24 28.0312 24H11V44H28.0312Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round", fillRule: "evenodd", clipRule: "evenodd" },
  ], supportsVariants: false },
  "fa-book": { viewBox: "0 0 448 512", paths: [
    {"d":"M384 512L96 512c-53 0-96-43-96-96L0 96C0 43 43 0 96 0L400 0c26.5 0 48 21.5 48 48l0 288c0 20.9-13.4 38.7-32 45.3l0 66.7c17.7 0 32 14.3 32 32s-14.3 32-32 32l-32 0zM96 384c-17.7 0-32 14.3-32 32s14.3 32 32 32l256 0 0-64-256 0zm32-232c0 13.3 10.7 24 24 24l176 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-176 0c-13.3 0-24 10.7-24 24zm24 72c-13.3 0-24 10.7-24 24s10.7 24 24 24l176 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-176 0z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-book-open": { viewBox: "0 0 512 512", paths: [
    {"d":"M256 141.3l0 309.3 .5-.2C311.1 427.7 369.7 416 428.8 416l19.2 0 0-320-19.2 0c-42.2 0-84.1 8.4-123.1 24.6-16.8 7-33.4 13.9-49.7 20.7zM230.9 61.5L256 72 281.1 61.5C327.9 42 378.1 32 428.8 32L464 32c26.5 0 48 21.5 48 48l0 352c0 26.5-21.5 48-48 48l-35.2 0c-50.7 0-100.9 10-147.7 29.5l-12.8 5.3c-7.9 3.3-16.7 3.3-24.6 0l-12.8-5.3C184.1 490 133.9 480 83.2 480L48 480c-26.5 0-48-21.5-48-48L0 80C0 53.5 21.5 32 48 32l35.2 0c50.7 0 100.9 10 147.7 29.5z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-calendar": { viewBox: "0 0 448 512", paths: [
    {"d":"M120 0c13.3 0 24 10.7 24 24l0 40 160 0 0-40c0-13.3 10.7-24 24-24s24 10.7 24 24l0 40 32 0c35.3 0 64 28.7 64 64l0 288c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 128C0 92.7 28.7 64 64 64l32 0 0-40c0-13.3 10.7-24 24-24zm0 112l-56 0c-8.8 0-16 7.2-16 16l0 48 352 0 0-48c0-8.8-7.2-16-16-16l-264 0zM48 224l0 192c0 8.8 7.2 16 16 16l320 0c8.8 0 16-7.2 16-16l0-192-352 0z","variant":"outline","fill":"currentColor"},
    {"d":"M128 0C110.3 0 96 14.3 96 32l0 32-32 0C28.7 64 0 92.7 0 128l0 48 448 0 0-48c0-35.3-28.7-64-64-64l-32 0 0-32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 32-128 0 0-32c0-17.7-14.3-32-32-32zM0 224L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-192-448 0z","variant":"solid","fill":"currentColor"},
  ], supportsVariants: true },
  "fa-calendar-days": { viewBox: "0 0 448 512", paths: [
    {"d":"M120 0c13.3 0 24 10.7 24 24l0 40 160 0 0-40c0-13.3 10.7-24 24-24s24 10.7 24 24l0 40 32 0c35.3 0 64 28.7 64 64l0 288c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 128C0 92.7 28.7 64 64 64l32 0 0-40c0-13.3 10.7-24 24-24zM384 432c8.8 0 16-7.2 16-16l0-64-88 0 0 80 72 0zm16-128l0-80-88 0 0 80 88 0zm-136 0l0-80-80 0 0 80 80 0zm-128 0l0-80-88 0 0 80 88 0zM48 352l0 64c0 8.8 7.2 16 16 16l72 0 0-80-88 0zm136 0l0 80 80 0 0-80-80 0zM120 112l-56 0c-8.8 0-16 7.2-16 16l0 48 352 0 0-48c0-8.8-7.2-16-16-16l-264 0z","variant":"outline","fill":"currentColor"},
    {"d":"M128 0c17.7 0 32 14.3 32 32l0 32 128 0 0-32c0-17.7 14.3-32 32-32s32 14.3 32 32l0 32 32 0c35.3 0 64 28.7 64 64l0 288c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 128C0 92.7 28.7 64 64 64l32 0 0-32c0-17.7 14.3-32 32-32zM64 240l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm128 0l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0zM64 368l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0zm112 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16z","variant":"solid","fill":"currentColor"},
  ], supportsVariants: true },
  "fa-camera": { viewBox: "0 0 512 512", paths: [
    {"d":"M193.1 32c-18.7 0-36.2 9.4-46.6 24.9L120.5 96 64 96C28.7 96 0 124.7 0 160L0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-256c0-35.3-28.7-64-64-64l-56.5 0-26-39.1C355.1 41.4 337.6 32 318.9 32L193.1 32zm-6.7 51.6c1.5-2.2 4-3.6 6.7-3.6l125.7 0c2.7 0 5.2 1.3 6.7 3.6l33.2 49.8c4.5 6.7 11.9 10.7 20 10.7l69.3 0c8.8 0 16 7.2 16 16l0 256c0 8.8-7.2 16-16 16L64 432c-8.8 0-16-7.2-16-16l0-256c0-8.8 7.2-16 16-16l69.3 0c8 0 15.5-4 20-10.7l33.2-49.8zM256 384a112 112 0 1 0 0-224 112 112 0 1 0 0 224zM192 272a64 64 0 1 1 128 0 64 64 0 1 1 -128 0z","variant":"outline","fill":"currentColor"},
    {"d":"M149.1 64.8L138.7 96 64 96C28.7 96 0 124.7 0 160L0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-256c0-35.3-28.7-64-64-64l-74.7 0-10.4-31.2C356.4 45.2 338.1 32 317.4 32L194.6 32c-20.7 0-39 13.2-45.5 32.8zM256 192a96 96 0 1 1 0 192 96 96 0 1 1 0-192z","variant":"solid","fill":"currentColor"},
  ], supportsVariants: true },
  "fa-check": { viewBox: "0 0 448 512", paths: [
    {"d":"M434.8 70.1c14.3 10.4 17.5 30.4 7.1 44.7l-256 352c-5.5 7.6-14 12.3-23.4 13.1s-18.5-2.7-25.1-9.3l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l101.5 101.5 234-321.7c10.4-14.3 30.4-17.5 44.7-7.1z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-chevron-down": { viewBox: "0 0 448 512", paths: [
    {"d":"M201.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 338.7 54.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-chevron-up": { viewBox: "0 0 448 512", paths: [
    {"d":"M201.4 105.4c12.5-12.5 32.8-12.5 45.3 0l192 192c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L224 173.3 54.6 342.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l192-192z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-circle": { viewBox: "0 0 512 512", paths: [
    {"d":"M464 256a208 208 0 1 0 -416 0 208 208 0 1 0 416 0zM0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0z","variant":"outline","fill":"currentColor"},
    {"d":"M0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0z","variant":"solid","fill":"currentColor"},
  ], supportsVariants: true },
  "fa-circle-plus": { viewBox: "0 0 512 512", paths: [
    {"d":"M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512zM232 344l0-64-64 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l64 0 0-64c0-13.3 10.7-24 24-24s24 10.7 24 24l0 64 64 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-64 0 0 64c0 13.3-10.7 24-24 24s-24-10.7-24-24z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-circle-user": { viewBox: "0 0 16 16", paths: [{"d":"M8 0C12.4181 0 16 3.58195 16 8C16 10.2378 15.08 12.262 13.5994 13.7134L13.5983 13.7144C12.156 15.1276 10.1793 16 8 16C5.82066 16 3.84403 15.1276 2.40169 13.7144L2.40063 13.7134C0.920029 12.262 0 10.2378 0 8C0 3.58195 3.58195 0 8 0ZM8 10.5949C6.41677 10.5949 5.05322 11.54 4.4455 12.8984C5.44387 13.6242 6.67087 14.0533 8 14.0533C9.32882 14.0533 10.5552 13.6239 11.5534 12.8984C10.9457 11.5402 9.58309 10.5949 8 10.5949ZM2.66456 13.8348C2.67879 13.8355 2.69821 13.8317 2.7184 13.8306C2.69215 13.8304 2.66211 13.83 2.63711 13.8274C2.64751 13.8296 2.65656 13.8337 2.66456 13.8348ZM13.2805 13.8306C13.3011 13.8317 13.321 13.8355 13.3354 13.8348C13.3432 13.8337 13.3518 13.8295 13.3618 13.8274C13.3367 13.8299 13.3067 13.8304 13.2805 13.8306ZM2.77963 13.8263C2.78829 13.8252 2.79648 13.8265 2.80285 13.8253C2.81534 13.8219 2.83134 13.8135 2.84824 13.8073C2.82691 13.8141 2.80124 13.8214 2.77963 13.8263ZM13.1972 13.8253C13.2033 13.8265 13.2111 13.8253 13.2193 13.8263C13.1976 13.8214 13.1719 13.8141 13.1507 13.8073C13.1679 13.8137 13.1844 13.8218 13.1972 13.8253ZM13.4336 13.8084C13.4508 13.8032 13.4676 13.8015 13.479 13.7968C13.4869 13.7927 13.4953 13.785 13.5054 13.7788C13.4847 13.7889 13.458 13.7992 13.4336 13.8084ZM2.52098 13.7957C2.53103 13.7999 2.54528 13.8017 2.56004 13.8063C2.53826 13.7979 2.51527 13.7888 2.4967 13.7799C2.50595 13.7855 2.51365 13.7919 2.52098 13.7957ZM2.89258 13.7904C2.89621 13.7888 2.90031 13.7887 2.90314 13.7873C2.91148 13.7827 2.92165 13.7743 2.9327 13.7672C2.92005 13.7748 2.90553 13.7836 2.89258 13.7904ZM13.0969 13.7873C13.0995 13.7885 13.1031 13.789 13.1064 13.7904C13.0933 13.7835 13.0788 13.7748 13.0662 13.7672C13.0775 13.7744 13.0883 13.7826 13.0969 13.7873ZM2.96226 13.7493L2.96754 13.7461C2.97411 13.7408 2.9833 13.7326 2.99182 13.725C2.98287 13.7327 2.97155 13.742 2.96226 13.7493ZM13.5571 13.744C13.5683 13.7361 13.5797 13.7309 13.5867 13.725C13.5903 13.7215 13.5929 13.7158 13.5973 13.7113C13.5855 13.7219 13.5708 13.733 13.5571 13.744ZM2.40169 13.7123C2.40583 13.7167 2.40984 13.7217 2.4133 13.725C2.41968 13.7304 2.42986 13.7348 2.43969 13.7419C2.42722 13.7318 2.41457 13.721 2.4038 13.7113L2.40169 13.7123ZM2.3489 13.6532C2.35322 13.659 2.36073 13.6658 2.36791 13.6743C2.35756 13.6609 2.34589 13.6464 2.33835 13.6353C2.34235 13.6418 2.34571 13.6484 2.3489 13.6532ZM13.631 13.6743C13.6384 13.6656 13.6467 13.6591 13.6511 13.6532C13.6542 13.6486 13.6567 13.6416 13.6606 13.6353C13.653 13.6465 13.6414 13.661 13.631 13.6743ZM13.6796 13.6025C13.6814 13.5992 13.6836 13.5966 13.6849 13.5941C13.686 13.5918 13.6868 13.5885 13.688 13.5856C13.6855 13.5908 13.6826 13.5967 13.6796 13.6025ZM2.28134 13.3112L2.27712 13.3281C2.27712 13.3281 2.27669 13.3336 2.27606 13.3376L2.27712 13.3333L2.70362 13.4041L2.2824 13.3048L2.28134 13.3112ZM13.2964 13.4041L13.7229 13.3333L13.7239 13.3376C13.7233 13.3336 13.7229 13.3281 13.7229 13.3281L13.7187 13.3112L13.7176 13.3048L13.2964 13.4041ZM13.7282 13.3766L13.7292 13.3808C13.729 13.3772 13.7284 13.374 13.7282 13.3713V13.3766ZM8 1.94669C4.65662 1.94669 1.94669 4.65662 1.94669 8C1.94669 9.27878 2.34378 10.4633 3.02032 11.4405C3.55996 10.5599 4.32592 9.83368 5.23832 9.34283C4.67028 8.69603 4.3241 7.84804 4.3241 6.91898C4.3241 4.88906 5.97008 3.24307 8 3.24307C10.0299 3.24307 11.6759 4.88906 11.6759 6.91898C11.6759 7.84829 11.3289 8.69596 10.7606 9.34283C11.6732 9.83361 12.4388 10.5599 12.9786 11.4405C13.6554 10.4632 14.0533 9.27899 14.0533 8C14.0533 4.65662 11.3434 1.94669 8 1.94669ZM8 5.18976C7.04475 5.18976 6.27078 5.96373 6.27078 6.91898C6.27078 7.87422 7.04475 8.64819 8 8.64819C8.95525 8.64819 9.72922 7.87422 9.72922 6.91898C9.72922 5.96373 8.95525 5.18976 8 5.18976Z","fillRule":"evenodd","clipRule":"evenodd","variant":"default","fill":"currentColor"}], supportsVariants: false },
  "fa-circle-xmark": { viewBox: "0 0 48 48", paths: [
    { d: "M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z", variant: "default", fill: "currentColor", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
    { d: "M29.6567 18.3432L18.343 29.6569", variant: "default", fill: "none", stroke: "var(--ink-color-text-anti)", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M18.3433 18.3432L29.657 29.6569", variant: "default", fill: "none", stroke: "var(--ink-color-text-anti)", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-clock": { viewBox: "0 0 512 512", paths: [
    {"d":"M464 256a208 208 0 1 1 -416 0 208 208 0 1 1 416 0zM0 256a256 256 0 1 0 512 0 256 256 0 1 0 -512 0zM232 120l0 136c0 8 4 15.5 10.7 20l96 64c11 7.4 25.9 4.4 33.3-6.7s4.4-25.9-6.7-33.3L280 243.2 280 120c0-13.3-10.7-24-24-24s-24 10.7-24 24z","variant":"outline","fill":"currentColor"},
    {"d":"M256 0a256 256 0 1 1 0 512 256 256 0 1 1 0-512zM232 120l0 136c0 8 4 15.5 10.7 20l96 64c11 7.4 25.9 4.4 33.3-6.7s4.4-25.9-6.7-33.3L280 243.2 280 120c0-13.3-10.7-24-24-24s-24 10.7-24 24z","variant":"solid","fill":"currentColor"},
  ], supportsVariants: true },
  "fa-clock-rotate-left": { viewBox: "0 0 48 48", paths: [
    { d: "M5.81836 6.72729V14H13.0911", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M4 24C4 35.0457 12.9543 44 24 44V44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C16.598 4 10.1351 8.02111 6.67677 13.9981", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24.005 12L24.0038 24.0088L32.4832 32.4882", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-cloud-arrow-up": { viewBox: "0 0 576 512", paths: [
    {"d":"M144 480c-79.5 0-144-64.5-144-144 0-63.4 41-117.2 97.9-136.5-1.3-7.7-1.9-15.5-1.9-23.5 0-79.5 64.5-144 144-144 55.4 0 103.5 31.3 127.6 77.1 14.2-8.3 30.8-13.1 48.4-13.1 53 0 96 43 96 96 0 15.7-3.8 30.6-10.5 43.7 44 20.3 74.5 64.7 74.5 116.3 0 70.7-57.3 128-128 128l-304 0zM305 191c-9.4-9.4-24.6-9.4-33.9 0l-72 72c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l31-31 0 102.1c0 13.3 10.7 24 24 24s24-10.7 24-24l0-102.1 31 31c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-72-72z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-comment-dots": { viewBox: "0 0 512 512", paths: [
    {"d":"M0 240c0 54.4 19.3 104.6 51.9 144.9L3.1 474.3c-2 3.7-3.1 7.9-3.1 12.2 0 14.1 11.4 25.5 25.5 25.5 4 0 7.8-.6 11.5-2.1L153.4 460c31.4 12.9 66.1 20 102.6 20 141.4 0 256-107.5 256-240S397.4 0 256 0 0 107.5 0 240zM94 407.9c9.3-17.1 7.4-38.1-4.8-53.2-26.1-32.3-41.2-71.9-41.2-114.7 0-103.2 90.2-192 208-192s208 88.8 208 192-90.2 192-208 192c-30.2 0-58.7-5.9-84.3-16.4-11.9-4.9-25.3-4.8-37.1 .3L76 440.9 94 407.9zM144 272a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm144-32a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zm80 32a32 32 0 1 0 0-64 32 32 0 1 0 0 64z","variant":"outline","fill":"currentColor"},
    {"d":"M256 480c141.4 0 256-107.5 256-240S397.4 0 256 0 0 107.5 0 240c0 54.3 19.2 104.3 51.6 144.5L2.8 476.8c-4.8 9-3.3 20 3.6 27.5s17.8 9.8 27.1 5.8l118.4-50.7C183.7 472.6 218.9 480 256 480zM128 208a32 32 0 1 1 0 64 32 32 0 1 1 0-64zm128 0a32 32 0 1 1 0 64 32 32 0 1 1 0-64zm96 32a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z","variant":"solid","fill":"currentColor"},
  ], supportsVariants: true },
  "fa-compass": { viewBox: "0 0 512 512", paths: [
    {"d":"M464 256a208 208 0 1 0 -416 0 208 208 0 1 0 416 0zM0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0zm306.7 69.1L162.4 380.6c-19.4 7.5-38.5-11.6-31-31l55.5-144.3c3.3-8.5 9.9-15.1 18.4-18.4l144.3-55.5c19.4-7.5 38.5 11.6 31 31L325.1 306.7c-3.3 8.5-9.9 15.1-18.4 18.4zM288 256a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z","variant":"outline","fill":"currentColor"},
    {"d":"M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512zm50.7-186.9L162.4 380.6c-19.4 7.5-38.5-11.6-31-31l55.5-144.3c3.3-8.5 9.9-15.1 18.4-18.4l144.3-55.5c19.4-7.5 38.5 11.6 31 31L325.1 306.7c-3.2 8.5-9.9 15.1-18.4 18.4zM288 256a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z","variant":"solid","fill":"currentColor"},
  ], supportsVariants: true },
  "fa-compress": { viewBox: "0 0 48 48", paths: [
    { d: "M33 6V15H42", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M15 6V15H6", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M15 42V33H6", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M33 42V33H41.8995", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-crosshairs": { viewBox: "0 0 576 512", paths: [
    {"d":"M288-16c17.7 0 32 14.3 32 32l0 18.3c98.1 14 175.7 91.6 189.7 189.7l18.3 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-18.3 0c-14 98.1-91.6 175.7-189.7 189.7l0 18.3c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-18.3C157.9 463.7 80.3 386.1 66.3 288L48 288c-17.7 0-32-14.3-32-32s14.3-32 32-32l18.3 0C80.3 125.9 157.9 48.3 256 34.3L256 16c0-17.7 14.3-32 32-32zM131.2 288c12.7 62.7 62.1 112.1 124.8 124.8l0-12.8c0-17.7 14.3-32 32-32s32 14.3 32 32l0 12.8c62.7-12.7 112.1-62.1 124.8-124.8L432 288c-17.7 0-32-14.3-32-32s14.3-32 32-32l12.8 0C432.1 161.3 382.7 111.9 320 99.2l0 12.8c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-12.8C193.3 111.9 143.9 161.3 131.2 224l12.8 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-12.8 0zM288 208a48 48 0 1 1 0 96 48 48 0 1 1 0-96z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-detail-back-to-top": { viewBox: "0 0 24 24", paths: [
    {"d":"M12.0039 7.05078V21.0005M6 13L12 7L18 13M6 3H18", "variant":"default", "fill":"none", "stroke":"currentColor", "strokeWidth":"2", "strokeLinecap":"round", "strokeLinejoin":"round"},
  ], supportsVariants: false },
  "fa-detail-font-adjust": { viewBox: "0 0 24 24", paths: [
    {"d":"M16 3H21V8M8.5 16L9.59375 13.5M9.59375 13.5L12 8L14.4062 13.5M9.59375 13.5H14.4062M15.5 16L14.4062 13.5M8 3H3V8M16 21H21V16M8 21H3V16", "variant":"default", "fill":"none", "stroke":"currentColor", "strokeWidth":"2", "strokeLinecap":"round", "strokeLinejoin":"round"},
  ], supportsVariants: false },
  "fa-detail-line-height": { viewBox: "0 0 48 48", paths: [
    {"d":"M6 7H42", "variant":"default", "fill":"none", "stroke":"currentColor", "strokeWidth":"4", "strokeLinecap":"round"},
    {"d":"M6 41H42", "variant":"default", "fill":"none", "stroke":"currentColor", "strokeWidth":"4", "strokeLinecap":"round"},
    {"d":"M24 13L14 35M18 28L30 28M24 13L34 35", "variant":"default", "fill":"none", "stroke":"currentColor", "strokeWidth":"4", "strokeLinecap":"round", "strokeLinejoin":"round"},
  ], supportsVariants: false },
  "fa-detail-more": { viewBox: "0 0 24 24", paths: [
    {"d":"M9 3H4C3.44771 3 3 3.44771 3 4V9C3 9.5523 3.44771 10 4 10H9C9.5523 10 10 9.5523 10 9V4C10 3.44771 9.5523 3 9 3ZM9 14H4C3.44771 14 3 14.4477 3 15V20C3 20.5523 3.44771 21 4 21H9C9.5523 21 10 20.5523 10 20V15C10 14.4477 9.5523 14 9 14ZM20 3H15C14.4477 3 14 3.44771 14 4V9C14 9.5523 14.4477 10 15 10H20C20.5523 10 21 9.5523 21 9V4C21 3.44771 20.5523 3 20 3ZM20 14H15C14.4477 14 14 14.4477 14 15V20C14 20.5523 14.4477 21 15 21H20C20.5523 21 21 20.5523 21 20V15C21 14.4477 20.5523 14 20 14Z", "variant":"default", "fill":"none", "stroke":"currentColor", "strokeWidth":"2", "strokeLinejoin":"round"},
  ], supportsVariants: false },
  "fa-detail-night-mode": { viewBox: "0 0 24 24", paths: [
    {"d":"M14.0264 2.20543C11.2914 2.91848 9.27275 5.4053 9.27275 8.36365C9.27275 11.8782 12.1218 14.7273 15.6363 14.7273C18.5947 14.7273 21.0815 12.7086 21.7945 9.97365C21.9292 10.628 22 11.3058 22 12C22 17.5229 17.5229 22 12 22C6.47715 22 2 17.5229 2 12C2 6.47715 6.47715 2 12 2C12.6942 2 13.372 2.07075 14.0264 2.20543Z", "variant":"default", "fill":"none", "stroke":"currentColor", "strokeWidth":"2", "strokeLinejoin":"round"},
  ], supportsVariants: false },
  "fa-detail-paragraph-spacing": { viewBox: "0 0 48 48", paths: [
    {"d":"M8 6V12H40V6", "variant":"default", "fill":"none", "stroke":"currentColor", "strokeWidth":"4", "strokeLinecap":"round", "strokeLinejoin":"round"},
    {"d":"M14 24H34", "variant":"default", "fill":"none", "stroke":"currentColor", "strokeWidth":"4", "strokeLinecap":"round"},
    {"d":"M8 42V36H40V42", "variant":"default", "fill":"none", "stroke":"currentColor", "strokeWidth":"4", "strokeLinecap":"round", "strokeLinejoin":"round"},
  ], supportsVariants: false },
  "fa-detail-page-width": { viewBox: "0 0 24 24", paths: [
    {"d":"M3 3.5H21M4 12H20M6.99535 15L4 12.0023L7 9M17.0047 9L20 11.9977L17 15M3 20.5H21", "variant":"default", "fill":"none", "stroke":"currentColor", "strokeWidth":"2", "strokeLinecap":"round", "strokeLinejoin":"round"},
  ], supportsVariants: false },
  "fa-detail-report": { viewBox: "0 0 24 24", paths: [
    {"d":"M12 22C14.7614 22 17.2614 20.8807 19.0711 19.0711C20.8807 17.2614 22 14.7614 22 12C22 9.2386 20.8807 6.7386 19.0711 4.92893C17.2614 3.11929 14.7614 2 12 2C9.2386 2 6.7386 3.11929 4.92893 4.92893C3.11929 6.7386 2 9.2386 2 12C2 14.7614 3.11929 19.0711 4.92893 19.0711C6.7386 20.8807 9.2386 22 12 22Z", "variant":"default", "fill":"none", "stroke":"currentColor", "strokeWidth":"2", "strokeLinejoin":"round"},
    {"d":"M12 18.5C12.6903 18.5 13.25 17.9403 13.25 17.25C13.25 16.5597 12.6903 16 12 16C11.3097 16 10.75 16.5597 10.75 17.25C10.75 17.9403 11.3097 18.5 12 18.5Z", "variant":"default", "fill":"currentColor", "fillRule":"evenodd", "clipRule":"evenodd"},
    {"d":"M12 6V14", "variant":"default", "fill":"none", "stroke":"currentColor", "strokeWidth":"2", "strokeLinecap":"round", "strokeLinejoin":"round"},
  ], supportsVariants: false },
  "fa-droplet": { viewBox: "0 0 384 512", paths: [
    {"d":"M192 512C86 512 0 426 0 320 0 228.8 130.2 45.9 166.6-3.5 172.5-11.5 181.8-16 191.8-16l.4 0c10 0 19.3 4.5 25.2 12.5 36.4 49.4 166.6 232.3 166.6 323.5 0 106-86 192-192 192zM112 312c0-13.3-10.7-24-24-24s-24 10.7-24 24c0 75.1 60.9 136 136 136 13.3 0 24-10.7 24-24s-10.7-24-24-24c-48.6 0-88-39.4-88-88z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-ellipsis-vertical": { viewBox: "0 0 15 15", paths: [
    {"d":"M8.5 2.875C8.5 3.42728 8.05228 3.875 7.5 3.875C6.94772 3.875 6.5 3.42728 6.5 2.875C6.5 2.32272 6.94772 1.875 7.5 1.875C8.05228 1.875 8.5 2.32272 8.5 2.875Z","variant":"default","fill":"currentColor"},
    {"d":"M8.5 12.875C8.5 13.4273 8.05228 13.875 7.5 13.875C6.94772 13.875 6.5 13.4273 6.5 12.875C6.5 12.3227 6.94772 11.875 7.5 11.875C8.05228 11.875 8.5 12.3227 8.5 12.875Z","variant":"default","fill":"currentColor"},
    {"d":"M7.5 8.875C8.05228 8.875 8.5 8.42728 8.5 7.875C8.5 7.32272 8.05228 6.875 7.5 6.875C6.94772 6.875 6.5 7.32272 6.5 7.875C6.5 8.42728 6.94772 8.875 7.5 8.875Z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-ellipsis-circle": { viewBox: "0 0 48 48", paths: [
    { d: "M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M14 27C15.6569 27 17 25.6569 17 24C17 22.3431 15.6569 21 14 21C12.3431 21 11 22.3431 11 24C11 25.6569 12.3431 27 14 27Z", variant: "default", fill: "currentColor" },
    { d: "M24 27C25.6569 27 27 25.6569 27 24C27 22.3431 25.6569 21 24 21C22.3431 21 21 22.3431 21 24C21 25.6569 22.3431 27 24 27Z", variant: "default", fill: "currentColor" },
    { d: "M34 27C35.6569 27 37 25.6569 37 24C37 22.3431 35.6569 21 34 21C32.3431 21 31 22.3431 31 24C31 25.6569 32.3431 27 34 27Z", variant: "default", fill: "currentColor" },
  ], supportsVariants: false },
  "fa-envelope": { viewBox: "0 0 512 512", paths: [
    {"d":"M61.4 64C27.5 64 0 91.5 0 125.4 0 126.3 0 127.1 .1 128L0 128 0 384c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-256-.1 0c0-.9 .1-1.7 .1-2.6 0-33.9-27.5-61.4-61.4-61.4L61.4 64zM464 192.3L464 384c0 8.8-7.2 16-16 16L64 400c-8.8 0-16-7.2-16-16l0-191.7 154.8 117.4c31.4 23.9 74.9 23.9 106.4 0L464 192.3zM48 125.4C48 118 54 112 61.4 112l389.2 0c7.4 0 13.4 6 13.4 13.4 0 4.2-2 8.2-5.3 10.7L280.2 271.5c-14.3 10.8-34.1 10.8-48.4 0L53.3 136.1c-3.3-2.5-5.3-6.5-5.3-10.7z","variant":"outline","fill":"currentColor"},
    {"d":"M48 64c-26.5 0-48 21.5-48 48 0 15.1 7.1 29.3 19.2 38.4l208 156c17.1 12.8 40.5 12.8 57.6 0l208-156c12.1-9.1 19.2-23.3 19.2-38.4 0-26.5-21.5-48-48-48L48 64zM0 196L0 384c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-188-198.4 148.8c-34.1 25.6-81.1 25.6-115.2 0L0 196z","variant":"solid","fill":"currentColor"},
  ], supportsVariants: true },
  "fa-expand": { viewBox: "0 0 48 48", paths: [
    { d: "M33 6H42V15", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 33V42H33", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M15 42H6V33", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M6 15V6H15", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-eye": { viewBox: "0 0 48 48", paths: [
    { d: "M24 36C35.0457 36 44 24 44 24C44 24 35.0457 12 24 12C12.9543 12 4 24 4 24C4 24 12 36 24 36Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
    { d: "M24 29C26.7614 29 29 26.7614 29 24C29 21.2386 26.7614 19 24 19C21.2386 19 19 21.2386 19 24C19 26.7614 21.2386 29 24 29Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-eye-slash": { viewBox: "0 0 48 48", paths: [
    { d: "M6 16C6.63472 17.2193 7.59646 18.3504 8.82276 19.3554C12.261 22.1733 17.779 24 24 24C30.221 24 35.739 22.1733 39.1772 19.3554C40.4035 18.3504 41.3653 17.2193 42 16", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M28.9775 24L31.048 31.7274", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M37.3535 21.3536L43.0103 27.0104", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M5.00004 27.0103L10.6569 21.3534", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M16.9278 31.7276L18.9983 24.0001", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-face-smile": { viewBox: "0 0 512 512", paths: [
    {"d":"M464 256a208 208 0 1 0 -416 0 208 208 0 1 0 416 0zM0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0zm177.3 63.4C192.3 335 218.4 352 256 352s63.7-17 78.7-32.6c9.2-9.6 24.4-9.9 33.9-.7s9.9 24.4 .7 33.9c-22.1 23-60 47.4-113.3 47.4s-91.2-24.4-113.3-47.4c-9.2-9.6-8.9-24.8 .7-33.9s24.8-8.9 33.9 .7zM144 208a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm192-32a32 32 0 1 1 0 64 32 32 0 1 1 0-64z","variant":"outline","fill":"currentColor"},
    {"d":"M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512zM165.4 321.9c20.4 28 53.4 46.1 90.6 46.1s70.2-18.1 90.6-46.1c7.8-10.7 22.8-13.1 33.5-5.3s13.1 22.8 5.3 33.5C356.3 390 309.2 416 256 416s-100.3-26-129.4-65.9c-7.8-10.7-5.4-25.7 5.3-33.5s25.7-5.4 33.5 5.3zM144 208a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm192-32a32 32 0 1 1 0 64 32 32 0 1 1 0-64z","variant":"solid","fill":"currentColor"},
  ], supportsVariants: true },
  "fa-feather-pointed": { viewBox: "0 0 512 512", paths: [
    {"d":"M475.3 .1c9.9-.8 19.6 3 26.6 10s10.8 16.7 10 26.6c-4 49.3-17.4 126.2-46.3 199.7-1.8 4.5-5.5 7.9-10.2 9.3L374.5 270c-3.9 1.2-6.5 4.7-6.5 8.8 0 5.1 4.1 9.2 9.2 9.2l38.6 0c12 0 19.7 12.8 13.5 23.1-4 6.7-8.3 13.2-12.7 19.6-2 2.9-5 5-8.4 6.1L310.5 366c-3.9 1.2-6.5 4.7-6.5 8.8 0 5.1 4.1 9.2 9.2 9.2l16 0c14.6 0 21 17.4 8.8 25.4-68 45-137.7 43.3-182.4 31.3-12.7-3.4-24-9.9-34.4-17.9L48 496c-8.8 8.8-23.2 8.8-32 0s-8.8-23.2 0-32l80-80 .5 .5c.7-1.3 1.6-2.5 2.7-3.6L256 224c8.8-8.8 8.8-23.2 0-32s-23.2-8.8-32 0L89.7 326.2c-8.9 8.9-24 4.4-25-8.2-4.3-53.2 9.3-123.1 72.6-186.4 91.1-91.1 254.2-124.7 337.9-131.5z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-file-arrow-up": { viewBox: "0 0 384 512", paths: [
    {"d":"M0 64C0 28.7 28.7 0 64 0L213.5 0c17 0 33.3 6.7 45.3 18.7L365.3 125.3c12 12 18.7 28.3 18.7 45.3L384 448c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 64zm208-5.5l0 93.5c0 13.3 10.7 24 24 24L325.5 176 208 58.5zM209 263c-9.4-9.4-24.6-9.4-33.9 0l-64 64c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l23-23 0 86.1c0 13.3 10.7 24 24 24s24-10.7 24-24l0-86.1 23 23c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-64-64z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-file-import": { viewBox: "0 0 48 48", paths: [
    { d: "M40 23V14L31 4H10C8.89543 4 8 4.89543 8 6V42C8 43.1046 8.89543 44 10 44H22", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M33 29V43", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M26 36H33H40", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M30 4V14H40", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-flag": { viewBox: "0 0 448 512", paths: [
    {"d":"M48 24C48 10.7 37.3 0 24 0S0 10.7 0 24L0 488c0 13.3 10.7 24 24 24s24-10.7 24-24l0-100 80.3-20.1c41.1-10.3 84.6-5.5 122.5 13.4 44.2 22.1 95.5 24.8 141.7 7.4l34.7-13c12.5-4.7 20.8-16.6 20.8-30l0-279.7c0-23-24.2-38-44.8-27.7l-9.6 4.8c-46.3 23.2-100.8 23.2-147.1 0-35.1-17.6-75.4-22-113.5-12.5L48 52 48 24zm0 77.5l96.6-24.2c27-6.7 55.5-3.6 80.4 8.8 54.9 27.4 118.7 29.7 175 6.8l0 241.8-24.4 9.1c-33.7 12.6-71.2 10.7-103.4-5.4-48.2-24.1-103.3-30.1-155.6-17.1l-68.6 17.2 0-237z","variant":"outline","fill":"currentColor"},
    {"d":"M64 32C64 14.3 49.7 0 32 0S0 14.3 0 32L0 480c0 17.7 14.3 32 32 32s32-14.3 32-32l0-121.6 62.7-18.8c41.9-12.6 87.1-8.7 126.2 10.9 42.7 21.4 92.5 24 137.2 7.2l37.1-13.9c12.5-4.7 20.8-16.6 20.8-30l0-247.7c0-23-24.2-38-44.8-27.7l-11.8 5.9c-44.9 22.5-97.8 22.5-142.8 0-36.4-18.2-78.3-21.8-117.2-10.1L64 54.4 64 32z","variant":"solid","fill":"currentColor"},
  ], supportsVariants: true },
  "fa-font": { viewBox: "0 0 48 48", paths: [
    { d: "M4 44L24 4L44 44", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M12 28H36", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-gear": { viewBox: "0 0 48 48", paths: [
    { d: "M18.2838 43.1713C14.9327 42.1736 11.9498 40.3213 9.58787 37.867C10.469 36.8227 11 35.4734 11 34.0001C11 30.6864 8.31371 28.0001 5 28.0001C4.79955 28.0001 4.60139 28.01 4.40599 28.0292C4.13979 26.7277 4 25.3803 4 24.0001C4 21.9095 4.32077 19.8938 4.91579 17.9995C4.94381 17.9999 4.97188 18.0001 5 18.0001C8.31371 18.0001 11 15.3138 11 12.0001C11 11.0488 10.7786 10.1493 10.3846 9.35011C12.6975 7.1995 15.5205 5.59002 18.6521 4.72314C19.6444 6.66819 21.6667 8.00013 24 8.00013C26.3333 8.00013 28.3556 6.66819 29.3479 4.72314C32.4795 5.59002 35.3025 7.1995 37.6154 9.35011C37.2214 10.1493 37 11.0488 37 12.0001C37 15.3138 39.6863 18.0001 43 18.0001C43.0281 18.0001 43.0562 17.9999 43.0842 17.9995C43.6792 19.8938 44 21.9095 44 24.0001C44 25.3803 43.8602 26.7277 43.594 28.0292C43.3986 28.01 43.2005 28.0001 43 28.0001C39.6863 28.0001 37 30.6864 37 34.0001C37 35.4734 37.531 36.8227 38.4121 37.867C36.0502 40.3213 33.0673 42.1736 29.7162 43.1713C28.9428 40.752 26.676 39.0001 24 39.0001C21.324 39.0001 19.0572 40.752 18.2838 43.1713Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 31C27.866 31 31 27.866 31 24C31 20.134 27.866 17 24 17C20.134 17 17 20.134 17 24C17 27.866 20.134 31 24 31Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-hashtag": { viewBox: "0 0 512 512", paths: [
    {"d":"M214.7 .7c17.3 3.7 28.3 20.7 24.6 38l-19.1 89.3 126.5 0 22-102.7C372.4 8 389.4-3 406.7 .7s28.3 20.7 24.6 38L412.2 128 480 128c17.7 0 32 14.3 32 32s-14.3 32-32 32l-81.6 0-27.4 128 67.8 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-81.6 0-22 102.7c-3.7 17.3-20.7 28.3-38 24.6s-28.3-20.7-24.6-38l19.1-89.3-126.5 0-22 102.7c-3.7 17.3-20.7 28.3-38 24.6s-28.3-20.7-24.6-38L99.8 384 32 384c-17.7 0-32-14.3-32-32s14.3-32 32-32l81.6 0 27.4-128-67.8 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l81.6 0 22-102.7C180.4 8 197.4-3 214.7 .7zM206.4 192l-27.4 128 126.5 0 27.4-128-126.5 0z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-hourglass-half": { viewBox: "0 0 384 512", paths: [
    {"d":"M0 24C0 10.7 10.7 0 24 0L360 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-8 0 0 19c0 40.3-16 79-44.5 107.5l-81.5 81.5 81.5 81.5C336 366 352 404.7 352 445l0 19 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24L24 512c-13.3 0-24-10.7-24-24s10.7-24 24-24l8 0 0-19c0-40.3 16-79 44.5-107.5l81.5-81.5-81.5-81.5C48 146 32 107.3 32 67l0-19-8 0C10.7 48 0 37.3 0 24zM110.5 371.5c-3.9 3.9-7.5 8.1-10.7 12.5l184.4 0c-3.2-4.4-6.8-8.6-10.7-12.5l-81.5-81.5-81.5 81.5zM80.8 432c-.5 4.3-.8 8.6-.8 13l0 19 224 0 0-19c0-4.4-.3-8.7-.8-13L80.8 432zM254.1 160l-124.1 0 62.1 62.1 62.1-62.1zm39.7-48C300.4 98.1 304 82.7 304 67l0-19-224 0 0 19c0 15.7 3.6 31.1 10.2 45l203.5 0z","variant":"outline","fill":"currentColor"},
    {"d":"M32 0C14.3 0 0 14.3 0 32S14.3 64 32 64l0 11c0 42.4 16.9 83.1 46.9 113.1l67.9 67.9-67.9 67.9C48.9 353.9 32 394.6 32 437l0 11c-17.7 0-32 14.3-32 32s14.3 32 32 32l320 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l0-11c0-42.4-16.9-83.1-46.9-113.1l-67.9-67.9 67.9-67.9c30-30 46.9-70.7 46.9-113.1l0-11c17.7 0 32-14.3 32-32S369.7 0 352 0L32 0zM96 75l0-11 192 0 0 11c0 19-5.6 37.4-16 53L112 128c-10.3-15.6-16-34-16-53zm16 309c3.5-5.3 7.6-10.3 12.1-14.9l67.9-67.9 67.9 67.9c4.6 4.6 8.6 9.6 12.2 14.9L112 384z","variant":"solid","fill":"currentColor"},
  ], supportsVariants: true },
  "fa-house": { viewBox: "0 0 48 48", paths: [
    { d: "M9 18V42H39V18L24 6L9 18Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M19 29V42H29V29H19Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M9 42H39", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-images": { viewBox: "0 0 576 512", paths: [
    {"d":"M480 80c8.8 0 16 7.2 16 16l0 256c0 8.8-7.2 16-16 16l-320 0c-8.8 0-16-7.2-16-16l0-256c0-8.8 7.2-16 16-16l320 0zM160 32c-35.3 0-64 28.7-64 64l0 256c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-256c0-35.3-28.7-64-64-64L160 32zm80 112a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zm140.7 3.8c-4.3-7.3-12.2-11.8-20.7-11.8s-16.4 4.5-20.7 11.8l-46.5 79-17.2-24.6c-4.5-6.4-11.8-10.2-19.7-10.2s-15.2 3.8-19.7 10.2l-56 80c-5.1 7.3-5.8 16.9-1.6 24.8S191.1 320 200 320l240 0c8.6 0 16.6-4.6 20.8-12.1s4.2-16.7-.1-24.1l-80-136zM48 152c0-13.3-10.7-24-24-24S0 138.7 0 152L0 448c0 35.3 28.7 64 64 64l360 0c13.3 0 24-10.7 24-24s-10.7-24-24-24L64 464c-8.8 0-16-7.2-16-16l0-296z","variant":"outline","fill":"currentColor"},
    {"d":"M96 96c0-35.3 28.7-64 64-64l320 0c35.3 0 64 28.7 64 64l0 256c0 35.3-28.7 64-64 64l-320 0c-35.3 0-64-28.7-64-64L96 96zM24 128c13.3 0 24 10.7 24 24l0 296c0 8.8 7.2 16 16 16l360 0c13.3 0 24 10.7 24 24s-10.7 24-24 24L64 512c-35.3 0-64-28.7-64-64L0 152c0-13.3 10.7-24 24-24zm168 32a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm196.5 11.5c-4.4-7.1-12.1-11.5-20.5-11.5s-16.1 4.4-20.5 11.5l-56.3 92.1-24.5-30.6c-4.6-5.7-11.4-9-18.7-9s-14.2 3.3-18.7 9l-64 80c-5.8 7.2-6.9 17.1-2.9 25.4S174.8 352 184 352l272 0c8.7 0 16.7-4.7 20.9-12.3s4.1-16.8-.5-24.3l-88-144z","variant":"solid","fill":"currentColor"},
  ], supportsVariants: true },
  "fa-italic": { viewBox: "0 0 48 48", paths: [
    { d: "M20 6H36", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M12 42H28", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M29 5.95215L19 41.9998", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-link": { viewBox: "0 0 576 512", paths: [
    {"d":"M419.5 96c-16.6 0-32.7 4.5-46.8 12.7-15.8-16-34.2-29.4-54.5-39.5 28.2-24 64.1-37.2 101.3-37.2 86.4 0 156.5 70 156.5 156.5 0 41.5-16.5 81.3-45.8 110.6l-71.1 71.1c-29.3 29.3-69.1 45.8-110.6 45.8-86.4 0-156.5-70-156.5-156.5 0-1.5 0-3 .1-4.5 .5-17.7 15.2-31.6 32.9-31.1s31.6 15.2 31.1 32.9c0 .9 0 1.8 0 2.6 0 51.1 41.4 92.5 92.5 92.5 24.5 0 48-9.7 65.4-27.1l71.1-71.1c17.3-17.3 27.1-40.9 27.1-65.4 0-51.1-41.4-92.5-92.5-92.5zM275.2 173.3c-1.9-.8-3.8-1.9-5.5-3.1-12.6-6.5-27-10.2-42.1-10.2-24.5 0-48 9.7-65.4 27.1L91.1 258.2c-17.3 17.3-27.1 40.9-27.1 65.4 0 51.1 41.4 92.5 92.5 92.5 16.5 0 32.6-4.4 46.7-12.6 15.8 16 34.2 29.4 54.6 39.5-28.2 23.9-64 37.2-101.3 37.2-86.4 0-156.5-70-156.5-156.5 0-41.5 16.5-81.3 45.8-110.6l71.1-71.1c29.3-29.3 69.1-45.8 110.6-45.8 86.6 0 156.5 70.6 156.5 156.9 0 1.3 0 2.6 0 3.9-.4 17.7-15.1 31.6-32.8 31.2s-31.6-15.1-31.2-32.8c0-.8 0-1.5 0-2.3 0-33.7-18-63.3-44.8-79.6z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-lock": { viewBox: "0 0 48 48", paths: [
    { d: "M6 22H42V44H6V22Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
    { d: "M14 22V14C14 8.47715 18.4772 4 24 4C29.5228 4 34 8.47715 34 14V22", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 30V36", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-message": { viewBox: "0 0 512 512", paths: [
    { d: "M203.7 512.9s0 0 0 0l-37.8 26.7c-7.3 5.2-16.9 5.8-24.9 1.7S128 529 128 520l0-72-32 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l320 0c53 0 96 43 96 96l0 224c0 53-43 96-96 96l-120.4 0-91.9 64.9zm64.3-104.1c8.1-5.7 17.8-8.8 27.7-8.8L416 400c26.5 0 48-21.5 48-48l0-224c0-26.5-21.5-48-48-48L96 80c-26.5 0-48 21.5-48 48l0 224c0 26.5 21.5 48 48 48l56 0c10.4 0 19.3 6.6 22.6 15.9 .9 2.5 1.4 5.2 1.4 8.1l0 49.7c32.7-23.1 63.3-44.7 91.9-64.9z", variant: "outline", fill: "currentColor" },
    { d: "M0 352L0 128C0 75 43 32 96 32l320 0c53 0 96 43 96 96l0 224c0 53-43 96-96 96l-120 0c-5.2 0-10.2 1.7-14.4 4.8L166.4 539.2c-4.2 3.1-9.2 4.8-14.4 4.8-13.3 0-24-10.7-24-24l0-72-32 0c-53 0-96-43-96-96z", variant: "solid", fill: "currentColor" },
  ], supportsVariants: true },
  "fa-minus": { viewBox: "0 0 48 48", paths: [
    { d: "M4 24H44", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M8 10H12", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M20 10H28", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M36 10H40", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M8 38H12", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M20 38H28", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M36 38H40", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-moon": { viewBox: "0 0 48 48", paths: [
    { d: "M28.0527 4.41085C22.5828 5.83695 18.5455 10.8106 18.5455 16.7273C18.5455 23.7564 24.2436 29.4545 31.2727 29.4545C37.1894 29.4545 42.1631 25.4172 43.5891 19.9473C43.8585 21.256 44 22.6115 44 24C44 35.0457 35.0457 44 24 44C12.9543 44 4 35.0457 4 24C4 12.9543 12.9543 4 24 4C25.3885 4 26.744 4.14149 28.0527 4.41085Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-paper-plane": { viewBox: "0 0 576 512", paths: [
    {"d":"M290.5 287.7L491.4 86.9 359 456.3 290.5 287.7zM457.4 53L256.6 253.8 88 185.3 457.4 53zM38.1 216.8l205.8 83.6 83.6 205.8c5.3 13.1 18.1 21.7 32.3 21.7 14.7 0 27.8-9.2 32.8-23.1L570.6 8c3.5-9.8 1-20.6-6.3-28s-18.2-9.8-28-6.3L39.4 151.7c-13.9 5-23.1 18.1-23.1 32.8 0 14.2 8.6 27 21.7 32.3z","variant":"outline","fill":"currentColor"},
    {"d":"M536.4-26.3c9.8-3.5 20.6-1 28 6.3s9.8 18.2 6.3 28l-178 496.9c-5 13.9-18.1 23.1-32.8 23.1-14.2 0-27-8.6-32.3-21.7l-64.2-158c-4.5-11-2.5-23.6 5.2-32.6l94.5-112.4c5.1-6.1 4.7-15-.9-20.6s-14.6-6-20.6-.9L229.2 276.1c-9.1 7.6-21.6 9.6-32.6 5.2L38.1 216.8c-13.1-5.3-21.7-18.1-21.7-32.3 0-14.7 9.2-27.8 23.1-32.8l496.9-178z","variant":"solid","fill":"currentColor"},
  ], supportsVariants: true },
  "fa-pen": { viewBox: "0 0 512 512", paths: [
    {"d":"M352.9 21.2L308 66.1 445.9 204 490.8 159.1C504.4 145.6 512 127.2 512 108s-7.6-37.6-21.2-51.1L455.1 21.2C441.6 7.6 423.2 0 404 0s-37.6 7.6-51.1 21.2zM274.1 100L58.9 315.1c-10.7 10.7-18.5 24.1-22.6 38.7L.9 481.6c-2.3 8.3 0 17.3 6.2 23.4s15.1 8.5 23.4 6.2l127.8-35.5c14.6-4.1 27.9-11.8 38.7-22.6L412 237.9 274.1 100z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-pencil": { viewBox: "0 0 512 512", paths: [
    {"d":"M36.4 353.2c4.1-14.6 11.8-27.9 22.6-38.7l181.2-181.2 33.9-33.9c16.6 16.6 51.3 51.3 104 104l33.9 33.9-33.9 33.9-181.2 181.2c-10.7 10.7-24.1 18.5-38.7 22.6L30.4 510.6c-8.3 2.3-17.3 0-23.4-6.2S-1.4 489.3 .9 481L36.4 353.2zm55.6-3.7c-4.4 4.7-7.6 10.4-9.3 16.6l-24.1 86.9 86.9-24.1c6.4-1.8 12.2-5.1 17-9.7L91.9 349.5zm354-146.1c-16.6-16.6-51.3-51.3-104-104L308 65.5C334.5 39 349.4 24.1 352.9 20.6 366.4 7 384.8-.6 404-.6S441.6 7 455.1 20.6l35.7 35.7C504.4 69.9 512 88.3 512 107.4s-7.6 37.6-21.2 51.1c-3.5 3.5-18.4 18.4-44.9 44.9z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-play": { viewBox: "0 0 448 512", paths: [
    {"d":"M91.2 36.9c-12.4-6.8-27.4-6.5-39.6 .7S32 57.9 32 72l0 368c0 14.1 7.5 27.2 19.6 34.4s27.2 7.5 39.6 .7l336-184c12.8-7 20.8-20.5 20.8-35.1s-8-28.1-20.8-35.1l-336-184z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-repeat": { viewBox: "0 0 512 512", paths: [
    {"d":"M470.6 118.6c12.5-12.5 12.5-32.8 0-45.3l-64-64c-9.2-9.2-22.9-11.9-34.9-6.9S352 19.1 352 32l0 32-160 0C86 64 0 150 0 256 0 273.7 14.3 288 32 288s32-14.3 32-32c0-70.7 57.3-128 128-128l160 0 0 32c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l64-64zM41.4 393.4c-12.5 12.5-12.5 32.8 0 45.3l64 64c9.2 9.2 22.9 11.9 34.9 6.9S160 492.9 160 480l0-32 160 0c106 0 192-86 192-192 0-17.7-14.3-32-32-32s-32 14.3-32 32c0 70.7-57.3 128-128 128l-160 0 0-32c0-12.9-7.8-24.6-19.8-29.6s-25.7-2.2-34.9 6.9l-64 64z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-right-from-bracket": { viewBox: "0 0 48 48", paths: [
    { d: "M23.9917 6H6V42H24", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M33 33L42 24L33 15", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M16 23.9917H42", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-right-to-bracket": { viewBox: "0 0 512 512", paths: [
    {"d":"M345 273c9.4-9.4 9.4-24.6 0-33.9L201 95c-6.9-6.9-17.2-8.9-26.2-5.2S160 102.3 160 112l0 80-112 0c-26.5 0-48 21.5-48 48l0 32c0 26.5 21.5 48 48 48l112 0 0 80c0 9.7 5.8 18.5 14.8 22.2s19.3 1.7 26.2-5.2L345 273zm7 143c-17.7 0-32 14.3-32 32s14.3 32 32 32l64 0c53 0 96-43 96-96l0-256c0-53-43-96-96-96l-64 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l64 0c17.7 0 32 14.3 32 32l0 256c0 17.7-14.3 32-32 32l-64 0z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-rotate-left": { viewBox: "0 0 48 48", paths: [
    { d: "M11.2721 36.7279C14.5294 39.9853 19.0294 42 24 42C33.9411 42 42 33.9411 42 24C42 14.0589 33.9411 6 24 6C19.0294 6 14.5294 8.01472 11.2721 11.2721C9.61407 12.9301 6 17 6 17", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M6 9V17H14", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-rotate-right": { viewBox: "0 0 48 48", paths: [
    { d: "M36.7279 36.7279C33.4706 39.9853 28.9706 42 24 42C14.0589 42 6 33.9411 6 24C6 14.0589 14.0589 6 24 6C28.9706 6 33.4706 8.01472 36.7279 11.2721C38.3859 12.9301 42 17 42 17", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 8V17H33", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-shield-halved": { viewBox: "0 0 512 512", paths: [
    {"d":"M256 0c4.6 0 9.2 1 13.4 2.9L457.8 82.8c22 9.3 38.4 31 38.3 57.2-.5 99.2-41.3 280.7-213.6 363.2-16.7 8-36.1 8-52.8 0-172.4-82.5-213.1-264-213.6-363.2-.1-26.2 16.3-47.9 38.3-57.2L242.7 2.9C246.9 1 251.4 0 256 0zm0 66.8l0 378.1c138-66.8 175.1-214.8 176-303.4l-176-74.6 0 0z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-sparkles": { viewBox: "0 0 512 512", paths: [
    {"d":"M464 6.1c9.5-8.5 24-8.1 33 .9l8 8c9 9 9.4 23.5 .9 33l-85.8 95.9c-2.6 2.9-4.1 6.7-4.1 10.7l0 21.4c0 8.8-7.2 16-16 16l-15.8 0c-4.6 0-8.9 1.9-11.9 5.3L100.7 500.9c-6.3 7.1-15.3 11.1-24.8 11.1-8.8 0-17.3-3.5-23.5-9.8L9.7 459.7c-6.2-6.2-9.7-14.7-9.7-23.5 0-9.5 4-18.5 11.1-24.8l111.6-99.8c3.4-3 5.3-7.4 5.3-11.9l0-27.6c0-8.8 7.2-16 16-16l34.6 0c3.9 0 7.7-1.5 10.7-4.1L464 6.1zM432 288c3.6 0 6.7 2.4 7.7 5.8l14.8 51.7 51.7 14.8c3.4 1 5.8 4.1 5.8 7.7s-2.4 6.7-5.8 7.7l-51.7 14.8-14.8 51.7c-1 3.4-4.1 5.8-7.7 5.8s-6.7-2.4-7.7-5.8l-14.8-51.7-51.7-14.8c-3.4-1-5.8-4.1-5.8-7.7s2.4-6.7 5.8-7.7l51.7-14.8 14.8-51.7c1-3.4 4.1-5.8 7.7-5.8zM87.7 69.8l14.8 51.7 51.7 14.8c3.4 1 5.8 4.1 5.8 7.7s-2.4 6.7-5.8 7.7l-51.7 14.8-14.8 51.7c-1 3.4-4.1 5.8-7.7 5.8s-6.7-2.4-7.7-5.8L57.5 166.5 5.8 151.7c-3.4-1-5.8-4.1-5.8-7.7s2.4-6.7 5.8-7.7l51.7-14.8 14.8-51.7c1-3.4 4.1-5.8 7.7-5.8s6.7 2.4 7.7 5.8zM208 0c3.7 0 6.9 2.5 7.8 6.1l6.8 27.3 27.3 6.8c3.6 .9 6.1 4.1 6.1 7.8s-2.5 6.9-6.1 7.8l-27.3 6.8-6.8 27.3c-.9 3.6-4.1 6.1-7.8 6.1s-6.9-2.5-7.8-6.1l-6.8-27.3-27.3-6.8c-3.6-.9-6.1-4.1-6.1-7.8s2.5-6.9 6.1-7.8l27.3-6.8 6.8-27.3c.9-3.6 4.1-6.1 7.8-6.1z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-spinner": { viewBox: "0 0 512 512", paths: [
    {"d":"M208 48a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zm0 416a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zM48 208a48 48 0 1 1 0 96 48 48 0 1 1 0-96zm368 48a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zM75 369.1A48 48 0 1 1 142.9 437 48 48 0 1 1 75 369.1zM75 75A48 48 0 1 1 142.9 142.9 48 48 0 1 1 75 75zM437 369.1A48 48 0 1 1 369.1 437 48 48 0 1 1 437 369.1z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-strikethrough": { viewBox: "0 0 48 48", paths: [
    { d: "M5 24H43", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 24C40 30 34 44 24 44C13.9999 44 12 36 12 36", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M35.9999 12C35.9999 12 33 4 23.9999 4C14.9999 4 11.4359 11.5995 15.6096 18", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M12 36C12 36 15.9999 44 24 44C32 44 36.564 36.4005 32.3903 30", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-tag": { viewBox: "0 0 48 48", paths: [
    { d: "M8 44L8 6C8 4.89543 8.89543 4 10 4H38C39.1046 4 40 4.89543 40 6V44L24 35.7273L8 44Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
    { d: "M16 18H32", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-tag-heat": { viewBox: "0 0 48 48", paths: [
    { d: "M24 44C32.2347 44 38.9998 37.4742 38.9998 29.0981C38.9998 27.0418 38.8953 24.8375 37.7555 21.4116C36.6157 17.9858 36.3861 17.5436 35.1809 15.4279C34.666 19.7454 31.911 21.5448 31.2111 22.0826C31.2111 21.5231 29.5445 15.3359 27.0176 11.6339C24.537 8 21.1634 5.61592 19.1853 4C19.1853 7.06977 18.3219 11.6339 17.0854 13.9594C15.8489 16.2849 15.6167 16.3696 14.0722 18.1002C12.5278 19.8308 11.8189 20.3653 10.5274 22.4651C9.23596 24.565 9 27.3618 9 29.4181C9 37.7942 15.7653 44 24 44Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-tag-participants": { viewBox: "0 0 48 48", paths: [
    { d: "M19 20C22.866 20 26 16.866 26 13C26 9.13401 22.866 6 19 6C15.134 6 12 9.13401 12 13C12 16.866 15.134 20 19 20Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M32.6077 7C34.6405 8.2249 36.0001 10.4537 36.0001 13C36.0001 15.5463 34.6405 17.7751 32.6077 19", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M4 40.8V42H34V40.8C34 36.3196 34 34.0794 33.1281 32.3681C32.3611 30.8628 31.1372 29.6389 29.6319 28.8719C27.9206 28 25.6804 28 21.2 28H16.8C12.3196 28 10.0794 28 8.36808 28.8719C6.86278 29.6389 5.63893 30.8628 4.87195 32.3681C4 34.0794 4 36.3196 4 40.8Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M43.9999 42.0001V40.8001C43.9999 36.3197 43.9999 34.0795 43.128 32.3682C42.361 30.8629 41.1371 29.6391 39.6318 28.8721", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-tag-works": { viewBox: "0 0 48 48", paths: [
    { d: "M5 6H39C39 6 43 8 43 13C43 18 39 20 39 20H5C5 20 9 18 9 13C9 8 5 6 5 6Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M43 28H9C9 28 5 30 5 35C5 40 9 42 9 42H43C43 42 39 40 39 35C39 30 43 28 43 28Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-tags": { viewBox: "0 0 576 512", paths: [
    {"d":"M401.2 39.1L549.4 189.4c27.7 28.1 27.7 73.1 0 101.2L393 448.9c-9.3 9.4-24.5 9.5-33.9 .2s-9.5-24.5-.2-33.9L515.3 256.8c9.2-9.3 9.2-24.4 0-33.7L367 72.9c-9.3-9.4-9.2-24.6 .2-33.9s24.6-9.2 33.9 .2zM32.1 229.5L32.1 96c0-35.3 28.7-64 64-64l133.5 0c17 0 33.3 6.7 45.3 18.7l144 144c25 25 25 65.5 0 90.5L285.4 418.7c-25 25-65.5 25-90.5 0l-144-144c-12-12-18.7-28.3-18.7-45.3zm144-85.5a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-underline": { viewBox: "0 0 48 48", paths: [
    { d: "M8 44H40", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M37 6.09717C37 12.7638 37 15.3335 37 22.0002C37 29.1799 31.1797 35.0002 24 35.0002C16.8203 35.0002 11 29.1799 11 22.0002C11 15.3335 11 12.7638 11 6.09717", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round" },
  ], supportsVariants: false },
  "fa-user": { viewBox: "0 0 48 48", paths: [
    { d: "M24 4C28.4183 4 32 7.58172 32 12C32 16.4183 28.4183 20 24 20C19.5817 20 16 16.4183 16 12C16 7.58172 19.5817 4 24 4Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 44C42 34.0589 33.9411 26 24 26C14.0589 26 6 34.0589 6 44", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-user-check": { viewBox: "0 0 48 48", paths: [
    { d: "M24 4C28.4183 4 32 7.58172 32 12C32 16.4183 28.4183 20 24 20C19.5817 20 16 16.4183 16 12C16 7.58172 19.5817 4 24 4Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 44C42 34.0589 33.9411 26 24 26C14.0589 26 6 34.0589 6 44", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M30 36L22 44L18 40", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-user-circle": { viewBox: "0 0 16 16", paths: [{"d":"M8 0C12.4181 0 16 3.58195 16 8C16 10.2378 15.08 12.262 13.5994 13.7134L13.5983 13.7144C12.156 15.1276 10.1793 16 8 16C5.82066 16 3.84403 15.1276 2.40169 13.7144L2.40063 13.7134C0.920029 12.262 0 10.2378 0 8C0 3.58195 3.58195 0 8 0ZM8 10.5949C6.41677 10.5949 5.05322 11.54 4.4455 12.8984C5.44387 13.6242 6.67087 14.0533 8 14.0533C9.32882 14.0533 10.5552 13.6239 11.5534 12.8984C10.9457 11.5402 9.58309 10.5949 8 10.5949ZM2.66456 13.8348C2.67879 13.8355 2.69821 13.8317 2.7184 13.8306C2.69215 13.8304 2.66211 13.83 2.63711 13.8274C2.64751 13.8296 2.65656 13.8337 2.66456 13.8348ZM13.2805 13.8306C13.3011 13.8317 13.321 13.8355 13.3354 13.8348C13.3432 13.8337 13.3518 13.8295 13.3618 13.8274C13.3367 13.8299 13.3067 13.8304 13.2805 13.8306ZM2.77963 13.8263C2.78829 13.8252 2.79648 13.8265 2.80285 13.8253C2.81534 13.8219 2.83134 13.8135 2.84824 13.8073C2.82691 13.8141 2.80124 13.8214 2.77963 13.8263ZM13.1972 13.8253C13.2033 13.8265 13.2111 13.8253 13.2193 13.8263C13.1976 13.8214 13.1719 13.8141 13.1507 13.8073C13.1679 13.8137 13.1844 13.8218 13.1972 13.8253ZM13.4336 13.8084C13.4508 13.8032 13.4676 13.8015 13.479 13.7968C13.4869 13.7927 13.4953 13.785 13.5054 13.7788C13.4847 13.7889 13.458 13.7992 13.4336 13.8084ZM2.52098 13.7957C2.53103 13.7999 2.54528 13.8017 2.56004 13.8063C2.53826 13.7979 2.51527 13.7888 2.4967 13.7799C2.50595 13.7855 2.51365 13.7919 2.52098 13.7957ZM2.89258 13.7904C2.89621 13.7888 2.90031 13.7887 2.90314 13.7873C2.91148 13.7827 2.92165 13.7743 2.9327 13.7672C2.92005 13.7748 2.90553 13.7836 2.89258 13.7904ZM13.0969 13.7873C13.0995 13.7885 13.1031 13.789 13.1064 13.7904C13.0933 13.7835 13.0788 13.7748 13.0662 13.7672C13.0775 13.7744 13.0883 13.7826 13.0969 13.7873ZM2.96226 13.7493L2.96754 13.7461C2.97411 13.7408 2.9833 13.7326 2.99182 13.725C2.98287 13.7327 2.97155 13.742 2.96226 13.7493ZM13.5571 13.744C13.5683 13.7361 13.5797 13.7309 13.5867 13.725C13.5903 13.7215 13.5929 13.7158 13.5973 13.7113C13.5855 13.7219 13.5708 13.733 13.5571 13.744ZM2.40169 13.7123C2.40583 13.7167 2.40984 13.7217 2.4133 13.725C2.41968 13.7304 2.42986 13.7348 2.43969 13.7419C2.42722 13.7318 2.41457 13.721 2.4038 13.7113L2.40169 13.7123ZM2.3489 13.6532C2.35322 13.659 2.36073 13.6658 2.36791 13.6743C2.35756 13.6609 2.34589 13.6464 2.33835 13.6353C2.34235 13.6418 2.34571 13.6484 2.3489 13.6532ZM13.631 13.6743C13.6384 13.6656 13.6467 13.6591 13.6511 13.6532C13.6542 13.6486 13.6567 13.6416 13.6606 13.6353C13.653 13.6465 13.6414 13.661 13.631 13.6743ZM13.6796 13.6025C13.6814 13.5992 13.6836 13.5966 13.6849 13.5941C13.686 13.5918 13.6868 13.5885 13.688 13.5856C13.6855 13.5908 13.6826 13.5967 13.6796 13.6025ZM2.28134 13.3112L2.27712 13.3281C2.27712 13.3281 2.27669 13.3336 2.27606 13.3376L2.27712 13.3333L2.70362 13.4041L2.2824 13.3048L2.28134 13.3112ZM13.2964 13.4041L13.7229 13.3333L13.7239 13.3376C13.7233 13.3336 13.7229 13.3281 13.7229 13.3281L13.7187 13.3112L13.7176 13.3048L13.2964 13.4041ZM13.7282 13.3766L13.7292 13.3808C13.729 13.3772 13.7284 13.374 13.7282 13.3713V13.3766ZM8 1.94669C4.65662 1.94669 1.94669 4.65662 1.94669 8C1.94669 9.27878 2.34378 10.4633 3.02032 11.4405C3.55996 10.5599 4.32592 9.83368 5.23832 9.34283C4.67028 8.69603 4.3241 7.84804 4.3241 6.91898C4.3241 4.88906 5.97008 3.24307 8 3.24307C10.0299 3.24307 11.6759 4.88906 11.6759 6.91898C11.6759 7.84829 11.3289 8.69596 10.7606 9.34283C11.6732 9.83361 12.4388 10.5599 12.9786 11.4405C13.6554 10.4632 14.0533 9.27899 14.0533 8C14.0533 4.65662 11.3434 1.94669 8 1.94669ZM8 5.18976C7.04475 5.18976 6.27078 5.96373 6.27078 6.91898C6.27078 7.87422 7.04475 8.64819 8 8.64819C8.95525 8.64819 9.72922 7.87422 9.72922 6.91898C9.72922 5.96373 8.95525 5.18976 8 5.18976Z","fillRule":"evenodd","clipRule":"evenodd","variant":"default","fill":"currentColor"}], supportsVariants: false },
  "fa-user-group": { viewBox: "0 0 48 48", paths: [
    { d: "M19 20C22.866 20 26 16.866 26 13C26 9.13401 22.866 6 19 6C15.134 6 12 9.13401 12 13C12 16.866 15.134 20 19 20Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M32.6077 7C34.6405 8.2249 36.0001 10.4537 36.0001 13C36.0001 15.5463 34.6405 17.7751 32.6077 19", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M4 40.8V42H34V40.8C34 36.3196 34 34.0794 33.1281 32.3681C32.3611 30.8628 31.1372 29.6389 29.6319 28.8719C27.9206 28 25.6804 28 21.2 28H16.8C12.3196 28 10.0794 28 8.36808 28.8719C6.86278 29.6389 5.63893 30.8628 4.87195 32.3681C4 34.0794 4 36.3196 4 40.8Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M43.9999 42.0001V40.8001C43.9999 36.3197 43.9999 34.0795 43.128 32.3682C42.361 30.8629 41.1371 29.6391 39.6318 28.8721", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-user-edit": { viewBox: "0 0 48 48", paths: [
    { d: "M24 4C28.4183 4 32 7.58172 32 12C32 16.4183 28.4183 20 24 20C19.5817 20 16 16.4183 16 12C16 7.58172 19.5817 4 24 4Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 44C42 34.0589 33.9411 26 24 26C14.0589 26 6 34.0589 6 44", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M31 42L41 32L37 28L27 38V42H31Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-user-favorite": { viewBox: "0 0 48 48", paths: [
    { d: "M24 4C27.866 4 31 7.13401 31 11C31 14.866 27.866 18 24 18C20.134 18 17 14.866 17 11C17 7.13401 20.134 4 24 4Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M4 41C4 32.1634 12.0589 25 22 25", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M31.85 28C29.7237 28 28 30.0086 28 32.4864C28 36.9727 32.55 41.0513 35 42C37.45 41.0513 42 36.9727 42 32.4864C42 30.0086 40.2763 28 38.15 28C36.8479 28 35.6967 28.7533 35 29.9062C34.3033 28.7533 33.1521 28 31.85 28Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-user-minus": { viewBox: "0 0 48 48", paths: [
    { d: "M24 4C28.4183 4 32 7.58172 32 12C32 16.4183 28.4183 20 24 20C19.5817 20 16 16.4183 16 12C16 7.58172 19.5817 4 24 4Z", variant: "outline", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 44C42 34.0589 33.9411 26 24 26C14.0589 26 6 34.0589 6 44", variant: "outline", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M19 39H29", variant: "outline", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 4C28.4183 4 32 7.58172 32 12C32 16.4183 28.4183 20 24 20C19.5817 20 16 16.4183 16 12C16 7.58172 19.5817 4 24 4Z", variant: "solid", fill: "currentColor", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 44C42 34.0589 33.9411 26 24 26C14.0589 26 6 34.0589 6 44", variant: "solid", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M19 39H29", variant: "solid", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: true },
  "fa-user-search": { viewBox: "0 0 48 48", paths: [
    { d: "M24 4C27.866 4 31 7.13401 31 11C31 14.866 27.866 18 24 18C20.134 18 17 14.866 17 11C17 7.13401 20.134 4 24 4Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M4 41C4 32.1634 12.0589 25 22 25", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M35 28C38.3137 28 41 30.6863 41 34C41 37.3137 38.3137 40 35 40C31.6863 40 29 37.3137 29 34C29 30.6863 31.6863 28 35 28Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M40 38L44 41", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-user-shield": { viewBox: "0 0 48 48", paths: [
    { d: "M6 9.25564L24.0086 4L42 9.25564V20.0337C42 31.3622 34.7502 40.4194 24.0026 44.0005C13.2521 40.4195 6 31.36 6 20.0287V9.25564Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
    { d: "M24 13C26.7614 13 29 15.2386 29 18C29 20.7614 26.7614 23 24 23C21.2386 23 19 20.7614 19 18C19 15.2386 21.2386 13 24 13Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M32 31C32 26.5817 28.4183 23 24 23C19.5817 23 16 26.5817 16 31", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-users": { viewBox: "0 0 640 512", paths: [
    { "d": "M320 16a104 104 0 1 1 0 208 104 104 0 1 1 0-208zM96 88a72 72 0 1 1 0 144 72 72 0 1 1 0-144zM0 416c0-70.7 57.3-128 128-128 12.8 0 25.2 1.9 36.9 5.4-32.9 36.8-52.9 85.4-52.9 138.6l0 16c0 11.4 2.4 22.2 6.7 32L32 480c-17.7 0-32-14.3-32-32l0-32zm521.3 64c4.3-9.8 6.7-20.6 6.7-32l0-16c0-53.2-20-101.8-52.9-138.6 11.7-3.5 24.1-5.4 36.9-5.4 70.7 0 128 57.3 128 128l0 32c0 17.7-14.3 32-32 32l-86.7 0zM472 160a72 72 0 1 1 144 0 72 72 0 1 1 -144 0zM160 432c0-88.4 71.6-160 160-160s160 71.6 160 160l0 16c0 17.7-14.3 32-32 32l-256 0c-17.7 0-32-14.3-32-32l0-16z", "variant": "default", "fill": "currentColor" },
  ], supportsVariants: false },
  "fa-wand-magic-sparkles": { viewBox: "0 0 48 48", paths: [
    { d: "M19 7.99991L28 15.9999L38.0323 10.1097L33 20.9999L42 28.9999L30 27.9999L25.5 37.9999L23 26.9999L11.0004 25.9999L21.5082 19.6499L19 7.99991Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M8 42.0205L23 27", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-xmark": { viewBox: "0 0 384 512", paths: [
    {"d":"M55.1 73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L147.2 256 9.9 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192.5 301.3 329.9 438.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.8 256 375.1 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192.5 210.7 55.1 73.4z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-tag-remove": { viewBox: "0 0 48 48", paths: [
    { d: "M14 14L34 34", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M14 34L34 14", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-arrow-down": { viewBox: "0 0 384 512", paths: [
    {"d":"M169.4 470.6c12.5 12.5 32.8 12.5 45.3 0l144-144c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 370.7V32c0-17.7-14.3-32-32-32s-32 14.3-32 32v338.7L70.6 281.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l144 144z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-sun": { viewBox: "0 0 576 512", paths: [
    {"d":"M288-32c8 0 15.4 4 19.9 10.6l58.8 87.4 103.4-20.2c7.8-1.5 15.9 .9 21.6 6.6s8.1 13.8 6.6 21.6L478 177.3 565.4 236.1C572 240.5 576 248 576 256s-4 15.4-10.6 19.9L478 334.7 498.2 438c1.5 7.8-.9 15.9-6.6 21.6s-13.8 8.1-21.6 6.6L366.7 446 307.9 533.4C303.4 540 296 544 288 544s-15.4-4-19.9-10.6L209.3 446 105.9 466.2c-7.8 1.5-15.9-.9-21.6-6.6s-8.1-13.8-6.6-21.6L98 334.7 10.6 275.9C4 271.4 0 264 0 256s4-15.4 10.6-19.9L98 177.3 77.8 73.9c-1.5-7.8 .9-15.9 6.6-21.6s13.8-8.1 21.6-6.6l103.3 20.2 58.8-87.4 1.8-2.3C274.4-29 281-32 288-32zm-47.8 138c-5.4 8-15 12-24.5 10.2l-84-16.4 16.4 84c1.8 9.5-2.2 19.1-10.2 24.5L67 256 138 303.8c8 5.4 12 15 10.2 24.5l-16.4 84 84-16.4 3.5-.4c8.3-.4 16.3 3.6 21 10.6l47.8 71 47.8-71 2.2-2.8c5.6-6.1 14-9 22.3-7.3l84 16.4-16.4-84c-1.8-9.5 2.2-19.1 10.2-24.5l71-47.8-71-47.8c-8-5.4-12-15-10.2-24.5l16.4-84-84 16.4c-9.5 1.8-19.1-2.2-24.5-10.2l-47.8-71-47.8 71zM288 376a120 120 0 1 1 0-240 120 120 0 1 1 0 240zm0-192a72 72 0 1 0 0 144 72 72 0 1 0 0-144z","variant":"outline","fill":"currentColor"},
    {"d":"M288-32c8.4 0 16.3 4.4 20.6 11.7L364.1 72.3 468.9 46c8.2-2 16.9 .4 22.8 6.3S500 67 498 75.1l-26.3 104.7 92.7 55.5c7.2 4.3 11.7 12.2 11.7 20.6s-4.4 16.3-11.7 20.6L471.7 332.1 498 436.8c2 8.2-.4 16.9-6.3 22.8S477 468 468.9 466l-104.7-26.3-55.5 92.7c-4.3 7.2-12.2 11.7-20.6 11.7s-16.3-4.4-20.6-11.7L211.9 439.7 107.2 466c-8.2 2-16.8-.4-22.8-6.3S76 445 78 436.8l26.2-104.7-92.6-55.5C4.4 272.2 0 264.4 0 256s4.4-16.3 11.7-20.6L104.3 179.9 78 75.1c-2-8.2 .3-16.8 6.3-22.8S99 44 107.2 46l104.7 26.2 55.5-92.6 1.8-2.6c4.5-5.7 11.4-9.1 18.8-9.1zm0 144a144 144 0 1 0 0 288 144 144 0 1 0 0-288zm0 240a96 96 0 1 1 0-192 96 96 0 1 1 0 192z","variant":"solid","fill":"currentColor"},
  ], supportsVariants: true },
  "fa-arrow-down-wide-short": { viewBox: "0 0 48 48", paths: [
    { d: "M23 8H43", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M14 41L6 33", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M14 7V41", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M23 18H39", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M23 28H35", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M23 38H31", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-arrow-up-wide-short": { viewBox: "0 0 48 48", paths: [
    { d: "M23 9H43", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M5 16L13 8", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M13 8V42", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M23 19H39", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M23 29H35", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M23 39H31", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-ellipsis": { viewBox: "0 0 448 512", paths: [
    {"d":"M0 256a56 56 0 1 1 112 0 56 56 0 1 1 -112 0zm168 0a56 56 0 1 1 112 0 56 56 0 1 1 -112 0zm224-56a56 56 0 1 1 0 112 56 56 0 1 1 0-112z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-filter": { viewBox: "0 0 48 48", paths: [
    { d: "M6 9L20.4 25.8178V38.4444L27.6 42V25.8178L42 9H6Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-clear-compact": { viewBox: "0 0 15 15", paths: [
    { "d": "M7.5 0.537109C8.75644 0.537109 9.77539 1.55606 9.77539 2.8125V5.22461H10.7812C12.2966 5.22461 13.5254 6.45341 13.5254 7.96875V13.125C13.5254 13.8637 12.9262 14.4629 12.1875 14.4629H2.8125C2.07382 14.4629 1.47461 13.8637 1.47461 13.125V7.96875C1.47461 6.45341 2.70341 5.22461 4.21875 5.22461H5.22461V2.8125C5.22461 1.55606 6.24356 0.537109 7.5 0.537109ZM3.21289 12.7246H4.28711V10.3809H6.02539V12.7246H7.09961V11.3184H8.83789V12.7246H11.7871V9.77539H3.21289V12.7246ZM7.5 2.27539C7.20315 2.27539 6.96289 2.51565 6.96289 2.8125V6.96289H4.21875C3.66302 6.96289 3.21289 7.41302 3.21289 7.96875V8.03711H11.7871V7.96875C11.7871 7.41302 11.337 6.96289 10.7812 6.96289H8.03711V2.8125C8.03711 2.51565 7.79685 2.27539 7.5 2.27539Z", "variant": "default", "fill": "currentColor", "fillRule": "evenodd", "clipRule": "evenodd" },
  ], supportsVariants: false },
  "fa-filter-compact": { viewBox: "0 0 15 15", paths: [
    { "d": "M12.653 1.00586C13.8344 1.00586 14.436 2.42594 13.614 3.27441L10.2429 6.75293V13.3564C10.2426 14.1417 9.44545 14.6755 8.71943 14.376L5.29365 12.9629C4.96864 12.8286 4.75556 12.5109 4.75556 12.1592V6.75098L1.38544 3.27441C0.564051 2.42602 1.16543 1.00625 2.34638 1.00586H12.653ZM6.38056 5.93164L6.49287 6.04785V11.5771L8.50556 12.4072V6.04883L8.61884 5.93262L11.7087 2.74414H3.29169L6.38056 5.93164Z", "variant": "default", "fill": "currentColor", "fillRule": "evenodd", "clipRule": "evenodd" },
  ], supportsVariants: false },
  "fa-list-compact": { viewBox: "0 0 15 15", paths: [
    { "d": "M2.17918 11.558C2.71544 11.558 3.15016 11.9928 3.15016 12.529C3.15016 13.0653 2.71544 13.5 2.17918 13.5C1.64292 13.5 1.2082 13.0653 1.2082 12.529C1.2082 11.9928 1.64292 11.558 2.17918 11.558Z", "variant": "default", "fill": "currentColor" },
    { "d": "M13.1948 11.7924C13.6016 11.7924 13.9314 12.1222 13.9314 12.529C13.9314 12.9358 13.6016 13.2656 13.1948 13.2656H4.75731C4.35049 13.2656 4.0207 12.9358 4.0207 12.529C4.0207 12.1222 4.35049 11.7924 4.75731 11.7924H13.1948Z", "variant": "default", "fill": "currentColor" },
    { "d": "M2.10917 6.52916C2.64543 6.52916 3.08015 6.96388 3.08015 7.50014C3.08015 8.0364 2.64543 8.47112 2.10917 8.47112C1.5729 8.47112 1.13818 8.0364 1.13818 7.50014C1.13818 6.96388 1.5729 6.52916 2.10917 6.52916Z", "variant": "default", "fill": "currentColor" },
    { "d": "M13.1248 6.76353C13.5316 6.76353 13.8614 7.09332 13.8614 7.50014C13.8614 7.90696 13.5316 8.23675 13.1248 8.23675H4.68729C4.28047 8.23675 3.95068 7.90696 3.95068 7.50014C3.95068 7.09332 4.28047 6.76353 4.68729 6.76353H13.1248Z", "variant": "default", "fill": "currentColor" },
    { "d": "M2.10917 1.5C2.64543 1.5 3.08015 1.93472 3.08015 2.47098C3.08015 3.00725 2.64543 3.44196 2.10917 3.44196C1.5729 3.44196 1.13818 3.00725 1.13818 2.47098C1.13818 1.93472 1.5729 1.5 2.10917 1.5Z", "variant": "default", "fill": "currentColor" },
    { "d": "M13.1248 1.73438C13.5316 1.73438 13.8614 2.06417 13.8614 2.47098C13.8614 2.8778 13.5316 3.20759 13.1248 3.20759H4.68729C4.28047 3.20759 3.95068 2.8778 3.95068 2.47098C3.95068 2.06417 4.28047 1.73438 4.68729 1.73438H13.1248Z", "variant": "default", "fill": "currentColor" },
  ], supportsVariants: false },
  "fa-card-compact": { viewBox: "0 0 15 15", paths: [
    { "d": "M6.09375 7.71875C6.74958 7.71875 7.28125 8.25042 7.28125 8.90625V12.6562C7.28125 13.3121 6.74958 13.8438 6.09375 13.8438H2.34375C1.68792 13.8438 1.15625 13.3121 1.15625 12.6562V8.90625C1.15625 8.25042 1.68792 7.71875 2.34375 7.71875H6.09375ZM2.59375 12.4062H5.84375V9.15625H2.59375V12.4062Z", "variant": "default", "fill": "currentColor", "fillRule": "evenodd", "clipRule": "evenodd" },
    { "d": "M12.6562 7.71875C13.3121 7.71875 13.8438 8.25042 13.8438 8.90625V12.6562C13.8438 13.3121 13.3121 13.8438 12.6562 13.8438H8.90625C8.25042 13.8438 7.71875 13.3121 7.71875 12.6562V8.90625C7.71875 8.25042 8.25042 7.71875 8.90625 7.71875H12.6562ZM9.15625 12.4062H12.4062V9.15625H9.15625Z", "variant": "default", "fill": "currentColor", "fillRule": "evenodd", "clipRule": "evenodd" },
    { "d": "M6.09375 1.15625C6.74958 1.15625 7.28125 1.68792 7.28125 2.34375V6.09375C7.28125 6.74958 6.74958 7.28125 6.09375 7.28125H2.34375C1.68792 7.28125 1.15625 6.74958 1.15625 6.09375V2.34375C1.15625 1.68792 1.68792 1.15625 2.34375 1.15625H6.09375ZM2.59375 5.84375H5.84375V2.59375H2.59375Z", "variant": "default", "fill": "currentColor", "fillRule": "evenodd", "clipRule": "evenodd" },
    { "d": "M12.6562 1.15625C13.3121 1.15625 13.8438 1.68792 13.8438 2.34375V6.09375C13.8438 6.74958 13.3121 7.28125 12.6562 7.28125H8.90625C8.25042 7.28125 7.71875 6.74958 7.71875 6.09375V2.34375C7.71875 1.68792 8.25042 1.15625 8.90625 1.15625H12.6562ZM9.15625 5.84375H12.4062V2.59375H9.15625Z", "variant": "default", "fill": "currentColor", "fillRule": "evenodd", "clipRule": "evenodd" },
  ], supportsVariants: false },
  "fa-fire": { viewBox: "0 0 448 512", paths: [
    {"d":"M160.5-26.4c9.3-7.8 23-7.5 31.9 .9 12.3 11.6 23.3 24.4 33.9 37.4 13.5 16.5 29.7 38.3 45.3 64.2 5.2-6.8 10-12.8 14.2-17.9 1.1-1.3 2.2-2.7 3.3-4.1 7.9-9.8 17.7-22.1 30.8-22.1 13.4 0 22.8 11.9 30.8 22.1 1.3 1.7 2.6 3.3 3.9 4.8 10.3 12.4 24 30.3 37.7 52.4 27.2 43.9 55.6 106.4 55.6 176.6 0 123.7-100.3 224-224 224S0 411.7 0 288c0-91.1 41.1-170 80.5-225 19.9-27.7 39.7-49.9 54.6-65.1 8.2-8.4 16.5-16.7 25.5-24.2zM225.7 416c25.3 0 47.7-7 68.8-21 42.1-29.4 53.4-88.2 28.1-134.4-4.5-9-16-9.6-22.5-2l-25.2 29.3c-6.6 7.6-18.5 7.4-24.7-.5-17.3-22.1-49.1-62.4-65.3-83-5.4-6.9-15.2-8-21.5-1.9-18.3 17.8-51.5 56.8-51.5 104.3 0 68.6 50.6 109.2 113.7 109.2z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-list-check": { viewBox: "0 0 512 512", paths: [
    {"d":"M133.8 36.3c10.9 7.6 13.5 22.6 5.9 33.4l-56 80c-4.1 5.8-10.5 9.5-17.6 10.1S52 158 47 153L7 113C-2.3 103.6-2.3 88.4 7 79S31.6 69.7 41 79l19.8 19.8 39.6-56.6c7.6-10.9 22.6-13.5 33.4-5.9zm0 160c10.9 7.6 13.5 22.6 5.9 33.4l-56 80c-4.1 5.8-10.5 9.5-17.6 10.1S52 318 47 313L7 273c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l19.8 19.8 39.6-56.6c7.6-10.9 22.6-13.5 33.4-5.9zM224 96c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zm0 160c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zM160 416c0-17.7 14.3-32 32-32l288 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-288 0c-17.7 0-32-14.3-32-32zM64 376a40 40 0 1 1 0 80 40 40 0 1 1 0-80z","variant":"default","fill":"currentColor"},
  ], supportsVariants: false },
  "fa-sliders": { viewBox: "0 0 48 48", paths: [
    { d: "M11 16V42", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 29V42", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 19V6", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M37 6V32", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M11 16C13.7614 16 16 13.7614 16 11C16 8.23858 13.7614 6 11 6C8.23858 6 6 8.23858 6 11C6 13.7614 8.23858 16 11 16Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
    { d: "M24 29C26.7614 29 29 26.7614 29 24C29 21.2386 26.7614 19 24 19C21.2386 19 19 21.2386 19 24C19 26.7614 21.2386 29 24 29Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
    { d: "M37 42C39.7614 42 42 39.7614 42 37C42 34.2386 39.7614 32 37 32C34.2386 32 32 34.2386 32 37C32 39.7614 34.2386 42 37 42Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-profile-center": { viewBox: "0 0 48 48", paths: [
    { d: "M32 6H22V42H32V6Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 6H32V42H42V6Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M10 6L18 7L14.5 42L6 41L10 6Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M37 18V15", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M27 18V15", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-followers": { viewBox: "0 0 48 48", paths: [
    { d: "M19 20C22.866 20 26 16.866 26 13C26 9.13401 22.866 6 19 6C15.134 6 12 9.13401 12 13C12 16.866 15.134 20 19 20Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M32.6077 7C34.6405 8.2249 36.0001 10.4537 36.0001 13C36.0001 15.5463 34.6405 17.7751 32.6077 19", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M4 40.8V42H34V40.8C34 36.3196 34 34.0794 33.1281 32.3681C32.3611 30.8628 31.1372 29.6389 29.6319 28.8719C27.9206 28 25.6804 28 21.2 28H16.8C12.3196 28 10.0794 28 8.36808 28.8719C6.86278 29.6389 5.63893 30.8628 4.87195 32.3681C4 34.0794 4 36.3196 4 40.8Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M43.9999 42.0001V40.8001C43.9999 36.3197 43.9999 34.0795 43.128 32.3682C42.361 30.8629 41.1371 29.6391 39.6318 28.8721", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-about-us": { viewBox: "0 0 48 48", paths: [
    { d: "M24 4C28.4183 4 32 7.58172 32 12C32 16.4183 28.4183 20 24 20C19.5817 20 16 16.4183 16 12C16 7.58172 19.5817 4 24 4Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 44C42 34.0589 33.9411 26 24 26C14.0589 26 6 34.0589 6 44", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 44L28 39L24 26L20 39L24 44Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-contact-us": { viewBox: "0 0 48 48", paths: [
    { d: "M4 39H44V24V9H24H4V24V39Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M4 9L24 24L44 9", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 9H4V24", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M44 24V9H24", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-profile-settings": { viewBox: "0 0 48 48", paths: [
    { d: "M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 23C26.7614 23 29 20.7614 29 18C29 15.2386 26.7614 13 24 13C21.2386 13 19 15.2386 19 18C19 20.7614 21.2386 23 24 23Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M10.022 38.332C10.3657 33.1206 14.7016 29 20 29H28C33.2914 29 37.6229 33.1097 37.9767 38.3113", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-action-preview-open": { viewBox: "0 0 48 48", paths: [
    { d: "M24 36C35.0457 36 44 24 44 24C44 24 35.0457 12 24 12C12.9543 12 4 24 4 24C4 24 12.9543 36 24 36Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
    { d: "M24 29C26.7614 29 29 26.7614 29 24C29 21.2386 26.7614 19 24 19C21.2386 19 19 21.2386 19 24C19 26.7614 21.2386 29 24 29Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-action-edit": { viewBox: "0 0 48 48", paths: [
    { d: "M42 26V40C42 41.1046 41.1046 42 40 42H8C6.89543 42 6 41.1046 6 40V8C6 6.89543 6.89543 6 8 6L22 6", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M14 26.7199V34H21.3172L42 13.3081L34.6951 6L14 26.7199Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-action-delete": { viewBox: "6 3 36 42", paths: [
    { d: "M8 11L40 11", variant: "outline", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M18 5L30 5", variant: "outline", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M12 17H36V40C36 41.6569 34.6569 43 33 43H15C13.3431 43 12 41.6569 12 40V17Z", variant: "outline", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
    { d: "M8 11L40 11", variant: "solid", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M18 5L30 5", variant: "solid", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M12 17H36V40C36 41.6569 34.6569 43 33 43H15C13.3431 43 12 41.6569 12 40V17Z", variant: "solid", fill: "currentColor", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
  ], supportsVariants: true },
  "fa-action-forbid": { viewBox: "0 0 48 48", paths: [
    { d: "M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z", variant: "outline", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M15 15L33 33", variant: "outline", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4C12.9543 4 4 12.9543 4 24C4 35.0457 12.9543 44 24 44Z", variant: "solid", fill: "currentColor", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M15 15L33 33", variant: "solid", fill: "none", stroke: "var(--ink-color-text-anti)", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: true },
  "fa-word-count": { viewBox: "0 0 48 48", paths: [
    { d: "M40 23V14L31 4H10C8.89543 4 8 4.89543 8 6V42C8 43.1046 8.89543 44 10 44H22", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M34 30V44", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M28 30H34L40 30", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M30 4V14H40", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
};
