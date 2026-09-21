import { type SVGAttributes } from "react";
import { inklandAdditionalIconRegistry } from "./iconRegistryAdditional";

export type InklandIconName =
  | "fa-magnifying-glass"
  | "fa-file-lines"
  | "fa-image"
  | "fa-long-serial"
  | "fa-layer-group"
  | "fa-heart"
  | "fa-comment"
  | "fa-bookmark"
  | "fa-reply"
  | "fa-user-plus"
  | "fa-bars"
  | "fa-plus"
  | "fa-share-from-square"
  | "fa-pen-to-square"
  | "fa-trash-can"
  | "fa-chevron-left"
  | "fa-chevron-right"
  | "fa-circle-check"
  | "fa-circle-exclamation"
  | "fa-triangle-exclamation"
  | keyof typeof inklandAdditionalIconRegistry;

export type InklandIconVariant = "default" | "outline" | "solid";

type InklandIconPath = { d: string; variant?: "default" | "outline" | "solid"; [key: string]: string | undefined };
export type InklandIconDefinition = { viewBox: string; paths: InklandIconPath[]; supportsVariants?: boolean };

export const inklandIconRegistry: Record<InklandIconName, InklandIconDefinition> = {
  "fa-magnifying-glass": { viewBox: "0 0 48 48", paths: [
    { d: "M21 38C30.3888 38 38 30.3888 38 21C38 11.6112 30.3888 4 21 4C11.6112 4 4 11.6112 4 21C4 30.3888 11.6112 38 21 38Z", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M26.657 14.3431C25.2093 12.8954 23.2093 12 21.0001 12C18.791 12 16.791 12.8954 15.3433 14.3431", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M33.2216 33.2217L41.7069 41.707", variant: "default", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-file-lines": { viewBox: "0 0 24 24", paths: [
    {"d": "M5.25 1.5H14.25V5.99995C14.25 7.24259 15.2574 8.24995 16.5 8.24995H21V20.25C21 21.4926 19.9927 22.5 18.75 22.5H5.25C4.00737 22.5 3 21.4926 3 20.25V3.75C3 2.50737 4.00737 1.5 5.25 1.5ZM7.50016 12.75H16.5002V11.25H7.50016V12.75ZM16.5002 16.5V15H7.50016V16.5H16.5002ZM7.50016 9H12.0002V7.5H7.50016V9Z", "variant": "default", "fill": "currentColor"},
    {"d": "M20.5593 5.6951C20.8397 5.9748 20.9981 6.354 21 6.74986H16.5C16.0858 6.74986 15.75 6.41407 15.75 5.99986V1.5C16.1411 1.50435 16.5154 1.66136 16.7926 1.93791L20.5593 5.6951Z", "variant": "default", "fill": "currentColor"},
  ], supportsVariants: false },
  "fa-image": { viewBox: "0 0 24 24", paths: [
    {"d": "M14.25 1.5H5.25C4.00737 1.5 3 2.50737 3 3.75V20.25C3 21.4926 4.00737 22.5 5.25 22.5H18.75C19.9926 22.5 21 21.4926 21 20.25V8.24995H16.5C15.2574 8.24995 14.25 7.24259 14.25 5.99995V1.5ZM15.4697 14.2803C15.7626 13.9874 16.2374 13.9874 16.5303 14.2803L18.5 16.25V20H8.75L15.4697 14.2803ZM5.62867 20H5.5V14.9397L7.71991 11.7198C8.01281 11.4269 8.48768 11.4269 8.78058 11.7198L11.8448 14.7839L5.62867 20Z", "variant": "default", "fill": "currentColor"},
    {"d": "M21 6.74986C20.9981 6.354 20.8397 5.9748 20.5593 5.6951L16.7926 1.93791C16.5154 1.66136 16.1411 1.50435 15.75 1.5V5.99986C15.75 6.41407 16.0858 6.74986 16.5 6.74986H21Z", "variant": "default", "fill": "currentColor"},
  ], supportsVariants: false },
  "fa-long-serial": { viewBox: "0 0 24 24", paths: [
    {"d": "M3.5 18.5C3.5 14.6484 3.5 5.5 3.5 5.5C3.5 3.84315 4.84315 2.5 6.5 2.5H17.5V15.5C17.5 15.5 9.1163 15.5 6.5 15.5C4.85 15.5 3.5 16.8421 3.5 18.5Z", "variant": "default", "fill": "currentColor", "stroke": "currentColor", "strokeWidth": "2", "strokeLinejoin": "round"},
    {"d": "M17.5 15.5C17.5 15.5 7.07685 15.5 6.5 15.5C4.84315 15.5 3.5 16.8432 3.5 18.5C3.5 20.1568 4.84315 21.5 6.5 21.5C7.60455 21.5 12.9379 21.5 20.5 21.5V3.5", "variant": "default", "fill": "none", "stroke": "currentColor", "strokeWidth": "2", "strokeLinecap": "round", "strokeLinejoin": "round"},
    {"d": "M7 18.5H17", "variant": "default", "fill": "none", "stroke": "currentColor", "strokeWidth": "2", "strokeLinecap": "round", "strokeLinejoin": "round"},
  ], supportsVariants: false },
  "fa-layer-group": { viewBox: "0 0 512 512", paths: [
    { "d": "M232.5 5.2c14.9-6.9 32.1-6.9 47 0l218.6 101c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L13.9 149.8C5.4 145.8 0 137.3 0 128s5.4-17.9 13.9-21.8L232.5 5.2zM48.1 218.4l164.3 75.9c27.7 12.8 59.6 12.8 87.3 0l164.3-75.9 34.1 15.8c8.5 6.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L13.9 277.8C5.4 273.8 0 265.3 0 256s5.4-17.9 13.9-21.8l34.1-15.8zM13.9 362.2l34.1-15.8 164.3 75.9c27.7 12.8 59.6 12.8 87.3 0l164.3-75.9 34.1 15.8c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L13.9 405.8C5.4 401.8 0 393.3 0 384s5.4-17.9 13.9-21.8z", "variant": "default", "fill": "currentColor" },
  ], supportsVariants: false },
  "fa-heart": { viewBox: "0 0 32 32", paths: [
    {"d": "M16 5.76206C19.3339 2.67472 24.5394 2.74994 27.7803 5.99057L28.0059 6.21714C31.325 9.53662 31.3252 14.9183 28.0059 18.2376L17.0606 29.183C16.747 29.4964 16.3282 29.6425 15.919 29.6205C15.5631 29.6014 15.2106 29.4548 14.9385 29.183L3.99321 18.2376C0.674038 14.9183 0.674238 9.53658 3.99321 6.21714L4.21977 5.99057C7.46073 2.75003 12.6662 2.67461 16 5.76206ZM25.6592 8.11264C23.5113 5.96478 20.0288 5.96478 17.8809 8.11264L16 9.9935L14.1192 8.11264C11.9713 5.96478 8.48876 5.96475 6.34087 8.11264L6.11528 8.33823C3.96747 10.4861 3.96741 13.9687 6.11528 16.1166L16 26.0013L25.8848 16.1166C28.0326 13.9688 28.0323 10.4862 25.8848 8.33823L25.6592 8.11264Z", "variant": "outline", "fillRule": "evenodd", "clipRule": "evenodd", "fill": "currentColor"},
    {"d": "M16 5.76108C19.3339 2.67374 24.5394 2.74897 27.7803 5.9896L28.0059 6.21616C31.325 9.53564 31.3252 14.9173 28.0059 18.2367L17.0606 29.182C16.747 29.4954 16.3282 29.6415 15.919 29.6195C15.6076 29.6028 15.2994 29.488 15.045 29.2777L14.9385 29.182L3.99321 18.2367C0.67404 14.9173 0.674236 9.5356 3.99321 6.21616L4.21977 5.9896C7.46073 2.74906 12.6662 2.67364 16 5.76108Z", "variant": "solid", "fill": "currentColor"},
  ], supportsVariants: true },
  "fa-comment": { viewBox: "0 0 32 32", paths: [
    {"d": "M16 1.5C24.0081 1.5 30.5 7.99186 30.5 16C30.5 24.0081 24.0081 30.5 16 30.5C13.6212 30.5 11.3755 29.9254 9.39355 28.9092L5.93066 30.0771C3.983 30.7338 2.11958 28.8903 2.75488 26.9355L3.77441 23.7959C2.33563 21.5441 1.5 18.8693 1.5 16C1.5 7.99186 7.99186 1.5 16 1.5ZM16 4.5C9.64874 4.5 4.5 9.64874 4.5 16C4.5 18.3495 5.20224 20.5273 6.40723 22.3447L6.94043 23.1494L7.07422 23.3506L6.99902 23.5811L5.91504 26.916L9.45312 25.7236L9.65723 25.6553L9.84766 25.7559L10.6094 26.1611C12.2146 27.0149 14.0469 27.5 16 27.5C22.3513 27.5 27.5 22.3513 27.5 16C27.5 9.64874 22.3513 4.5 16 4.5Z", "variant": "outline", "fillRule": "evenodd", "clipRule": "evenodd", "fill": "currentColor"},
    {"d": "M10.3803 18.6055C11.0078 18.1722 11.9819 18.239 12.6049 18.9542C13.4307 19.9023 14.6457 20.5001 16.0004 20.5001C17.355 20.4999 18.5693 19.9022 19.3949 18.9542C20.018 18.239 20.9921 18.1722 21.6196 18.6055C21.9443 18.83 22.1775 19.1938 22.1889 19.6465C22.1998 20.0885 21.9982 20.5385 21.6244 20.962C20.251 22.5178 18.2401 23.4999 16.0004 23.5001C13.7605 23.5001 11.749 22.518 10.3754 20.962C10.0016 20.5384 9.8001 20.0886 9.81096 19.6465C9.8223 19.1938 10.0555 18.83 10.3803 18.6055Z", "variant": "outline", "fill": "currentColor"},
    {"d": "M16 1.5C24.0081 1.5 30.5 7.99186 30.5 16C30.5 24.0081 24.0081 30.5 16 30.5C13.5541 30.5 11.2489 29.8927 9.22656 28.8223L4.13281 30.4219C2.93339 30.7981 1.83073 29.6204 2.28516 28.4482L3.97168 24.0957C2.41235 21.7833 1.5 18.9979 1.5 16C1.5 7.99186 7.99186 1.5 16 1.5ZM21.6191 18.6064C20.9917 18.1734 20.0174 18.24 19.3945 18.9551C18.5689 19.903 17.3545 20.5008 16 20.501C14.6454 20.5009 13.4302 19.9031 12.6045 18.9551C11.9814 18.2402 11.0073 18.1731 10.3799 18.6064C10.0553 18.8309 9.8219 19.1948 9.81055 19.6475C9.79969 20.0894 10.0013 20.5394 10.375 20.9629C11.7485 22.5188 13.7602 23.5009 16 23.501C18.2396 23.5008 20.2506 22.5186 21.624 20.9629C21.9978 20.5394 22.1993 20.0894 22.1885 19.6475C22.1771 19.1947 21.9439 18.8309 21.6191 18.6064Z", "variant": "solid", "fillRule": "evenodd", "clipRule": "evenodd", "fill": "currentColor"},
  ], supportsVariants: true },
  "fa-bookmark": { viewBox: "0 0 32 32", paths: [
    {"d": "M25 1.5C26.3807 1.5 27.5 2.61929 27.5 4V28.9941C27.5 30.1165 26.3126 30.8411 25.3145 30.3281L16 25.5381L6.68555 30.3281C5.68737 30.8411 4.50001 30.1165 4.5 28.9941V4C4.5 2.61928 5.6193 1.5 7 1.5H25ZM7.5 26.5361L15.7715 22.2832L16 22.165L16.2285 22.2832L24.5 26.5361V4.5H7.5V26.5361Z", "variant": "outline", "fillRule": "evenodd", "clipRule": "evenodd", "fill": "currentColor"},
    {"d": "M25 1.5C26.3807 1.5 27.5 2.61929 27.5 4V28.9941C27.5 30.1165 26.3126 30.8411 25.3145 30.3281L16 25.5381L6.68555 30.3281C5.68737 30.8411 4.50001 30.1165 4.5 28.9941V4C4.5 2.61928 5.6193 1.5 7 1.5H25Z", "variant": "solid", "fill": "currentColor"},
  ], supportsVariants: true },
  "fa-reply": { viewBox: "0 0 512 512", paths: [
    { "d": "M204.2 18.4c12 5 19.8 16.6 19.8 29.6l0 80 112 0c97.2 0 176 78.8 176 176 0 113.3-81.5 163.9-100.2 174.1-2.5 1.4-5.3 1.9-8.1 1.9-10.9 0-19.7-8.9-19.7-19.7 0-7.5 4.3-14.4 9.8-19.5 9.4-8.8 22.2-26.4 22.2-56.7 0-53-43-96-96-96l-96 0 0 80c0 12.9-7.8 24.6-19.8 29.6s-25.7 2.2-34.9-6.9l-160-160c-12.5-12.5-12.5-32.8 0-45.3l160-160c9.2-9.2 22.9-11.9 34.9-6.9z", "variant": "default", "fill": "currentColor" },
  ] },
  "fa-user-plus": { viewBox: "0 0 48 48", paths: [
    { d: "M24 4C28.4183 4 32 7.58172 32 12C32 16.4183 28.4183 20 24 20C19.5817 20 16 16.4183 16 12C16 7.58172 19.5817 4 24 4Z", variant: "outline", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 44C42 34.0589 33.9411 26 24 26C14.0589 26 6 34.0589 6 44", variant: "outline", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M19 39H29", variant: "outline", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 34V44", variant: "outline", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 4C28.4183 4 32 7.58172 32 12C32 16.4183 28.4183 20 24 20C19.5817 20 16 16.4183 16 12C16 7.58172 19.5817 4 24 4Z", variant: "solid", fill: "currentColor", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M42 44C42 34.0589 33.9411 26 24 26C14.0589 26 6 34.0589 6 44", variant: "solid", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M19 39H29", variant: "solid", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
    { d: "M24 34V44", variant: "solid", fill: "none", stroke: "currentColor", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: true },
  "fa-circle-exclamation": { viewBox: "0 0 48 48", paths: [
    { d: "M24 2C36.1503 2 46 11.8497 46 24C46 36.1503 36.1503 46 24 46C11.8497 46 2 36.1503 2 24C2 11.8497 11.8497 2 24 2ZM22.5 18C21.3954 18 20.5 18.8954 20.5 20C20.5 21.1046 21.3954 22 22.5 22V32H21C19.8954 32 19 32.8954 19 34C19 35.1046 19.8954 36 21 36H28C29.1046 36 30 35.1046 30 34C30 32.8954 29.1046 32 28 32H26.5V20C26.5 18.8954 25.6046 18 24.5 18H22.5ZM24 11C22.6193 11 21.5 12.1193 21.5 13.5C21.5 14.8807 22.6193 16 24 16C25.3807 16 26.5 14.8807 26.5 13.5C26.5 12.1193 25.3807 11 24 11Z", variant: "default", fill: "currentColor" },
  ], supportsVariants: false },
  "fa-bars": { viewBox: "0 0 448 512", paths: [
    { "d": "M0 96C0 78.3 14.3 64 32 64l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 128C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32L32 448c-17.7 0-32-14.3-32-32s14.3-32 32-32l384 0c17.7 0 32 14.3 32 32z", "variant": "default", "fill": "currentColor" },
  ] },
  "fa-plus": { viewBox: "0 0 448 512", paths: [
    { "d": "M256 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 160-160 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l160 0 0 160c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160 160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-160 0 0-160z", "variant": "default", "fill": "currentColor" },
  ] },
  "fa-share-from-square": { viewBox: "0 0 32 32", paths: [
    {"d": "M16.5 5.00182C16.5 3.68304 18.0792 3.00632 19.0342 3.91588L30.0332 14.3915C30.647 14.9763 30.6545 15.9535 30.0498 16.5477L19.0508 27.3544C18.1021 28.2857 16.5002 27.6136 16.5 26.284V21.4969H15.1289C15.0879 21.4969 15.0463 21.4975 15.0049 21.4979C10.842 21.5424 7.02376 23.8353 5.0293 27.4969L4.31738 28.8036C3.57382 30.1682 1.50058 29.6407 1.5 28.0868V25.9969C1.50019 17.39 8.09015 10.3224 16.5 9.56432V5.00182ZM19.5 12.3788L19.0303 12.4071L17.1533 12.5233C11.2066 12.8903 6.30051 17.1111 4.90137 22.7186C7.57983 20.0541 11.2405 18.4969 15.1289 18.4969H19.5V22.7069L26.8408 15.493L19.5 8.50084V12.3788Z", "variant": "outline", "fillRule": "evenodd", "clipRule": "evenodd", "fill": "currentColor"},
    {"d": "M16.5 5.00182C16.5 3.68304 18.0792 3.00632 19.0342 3.91588L30.0332 14.3915C30.647 14.9763 30.6545 15.9535 30.0498 16.5477L19.0508 27.3544C18.1021 28.2857 16.5002 27.6136 16.5 26.284V21.4969H15.1289C10.9181 21.4969 7.04348 23.7991 5.0293 27.4969L4.31738 28.8036C3.57382 30.1682 1.50058 29.6407 1.5 28.0868V25.9969C1.50019 17.39 8.09015 10.3224 16.5 9.56432V5.00182Z", "variant": "solid", "fill": "currentColor"},
  ], supportsVariants: true },
  "fa-pen-to-square": { viewBox: "0 0 16 16", paths: [{"d":"M7.49609 1.10156C7.99315 1.10156 8.39648 1.5049 8.39648 2.00195C8.39638 2.49892 7.99308 2.90234 7.49609 2.90234H3.00195C2.94645 2.9026 2.90234 2.94739 2.90234 3.00195V12.9971C2.90249 13.0516 2.94663 13.0964 3.00195 13.0967H12.998L13.0371 13.0889C13.0729 13.0735 13.0975 13.0379 13.0977 12.9971V8.5C13.0977 8.00294 13.501 7.59961 13.998 7.59961C14.4951 7.59961 14.8984 8.00294 14.8984 8.5V12.9971C14.8983 14.0462 14.0469 14.8971 12.998 14.8975H3.00195C1.95313 14.8971 1.10171 14.0462 1.10156 12.9971V3.00195C1.10156 1.95265 1.95307 1.10189 3.00195 1.10156H7.49609ZM11.5928 1.01074C12.1395 0.464035 13.0265 0.464006 13.5732 1.01074L14.9873 2.4248C15.5339 2.97155 15.534 3.85858 14.9873 4.40527L8.50977 10.8828C8.2672 11.1253 7.94353 11.2699 7.60156 11.29L5.50977 11.4131C4.96797 11.4449 4.52063 10.9929 4.55859 10.4512L4.70312 8.38477C4.72685 8.04749 4.87256 7.73105 5.11035 7.49316L11.5928 1.01074ZM11.3301 4.66797C11.0958 4.4337 10.7167 4.4337 10.4824 4.66797L6.64648 8.50391C6.54532 8.60509 6.48368 8.73911 6.47363 8.88184C6.44894 9.23382 6.74808 9.53703 7.11133 9.51562C7.26064 9.50673 7.40303 9.44264 7.50684 9.33887L11.3301 5.51562C11.5643 5.28139 11.5643 4.90225 11.3301 4.66797ZM12.7852 2.76855C12.6736 2.65698 12.4924 2.65698 12.3809 2.76855C12.2694 2.88014 12.2693 3.06131 12.3809 3.17285L12.8252 3.61719C12.9367 3.72863 13.1179 3.72863 13.2295 3.61719C13.341 3.50565 13.341 3.32447 13.2295 3.21289L12.7852 2.76855Z","variant":"default","fill":"currentColor"}], supportsVariants: false },
  "fa-trash-can": { viewBox: "0 0 448 512", paths: [
    { "d": "M136.7 5.9C141.1-7.2 153.3-16 167.1-16H280.9c13.8 0 26 8.8 30.4 21.9L320 32h96c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 96 0 81.7 0 64S14.3 32 32 32h96l8.7-26.1zM32 144h384V448c0 35.3-28.7 64-64 64H96c-35.3 0-64-28.7-64-64V144zm88 64c-13.3 0-24 10.7-24 24V424c0 13.3 10.7 24 24 24s24-10.7 24-24V232c0-13.3-10.7-24-24-24zm104 0c-13.3 0-24 10.7-24 24V424c0 13.3 10.7 24 24 24s24-10.7 24-24V232c0-13.3-10.7-24-24-24zm104 0c-13.3 0-24 10.7-24 24V424c0 13.3 10.7 24 24 24s24-10.7 24-24V232c0-13.3-10.7-24-24-24z", "variant": "default", "fill": "currentColor" },
  ] },
  "fa-chevron-left": { viewBox: "0 0 320 512", paths: [
    { "d": "M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l192 192c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256 246.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-192 192z", "variant": "default", "fill": "currentColor" },
  ] },
  "fa-chevron-right": { viewBox: "0 0 320 512", paths: [
    { "d": "M310.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L242.7 256 73.4 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z", "variant": "default", "fill": "currentColor" },
  ] },
  "fa-circle-check": { viewBox: "0 0 48 48", paths: [
    { d: "M24 44C29.5228 44 34.5228 41.7614 38.1421 38.1421C41.7614 34.5228 44 29.5228 44 24C44 18.4772 41.7614 13.4772 38.1421 9.85786C34.5228 6.23858 29.5228 4 24 4C18.4772 4 13.4772 6.23858 9.85786 9.85786C6.23858 13.4772 4 18.4772 4 24C4 29.5228 6.23858 34.5228 9.85786 38.1421C13.4772 41.7614 18.4772 44 24 44Z", variant: "default", fill: "currentColor", stroke: "currentColor", strokeWidth: "4", strokeLinejoin: "round" },
    { d: "M16 24L22 30L34 18", variant: "default", fill: "none", stroke: "var(--ink-color-text-anti)", strokeWidth: "4", strokeLinecap: "round", strokeLinejoin: "round" },
  ], supportsVariants: false },
  "fa-triangle-exclamation": { viewBox: "0 0 512 512", paths: [
    { "d": "M256 0c14.7 0 28.2 8.1 35.2 21l216 400c6.7 12.4 6.4 27.4-.8 39.5S486.1 480 472 480L40 480c-14.1 0-27.2-7.4-34.4-19.5s-7.5-27.1-.8-39.5l216-400c7-12.9 20.5-21 35.2-21zm0 352a32 32 0 1 0 0 64 32 32 0 1 0 0-64zm0-192c-18.2 0-32.7 15.5-31.4 33.7l7.4 104c.9 12.5 11.4 22.3 23.9 22.3 12.6 0 23-9.7 23.9-22.3l7.4-104c1.3-18.2-13.1-33.7-31.4-33.7z", "variant": "default", "fill": "currentColor" },
  ], supportsVariants: false },
  ...inklandAdditionalIconRegistry,
};

export interface InklandIconProps extends Omit<SVGAttributes<SVGSVGElement>, "children" | "name"> {
  name: InklandIconName;
  variant?: InklandIconVariant;
  size?: number | string;
  label?: string;
}

export function InklandIcon({ name, variant = "default", size = 16, label, className, ...props }: InklandIconProps) {
  const definition = inklandIconRegistry[name];
  const resolvedVariant = definition.supportsVariants
    ? (variant === "default" ? "outline" : variant)
    : "default";
  const paths = definition.supportsVariants && variant !== "default"
    ? definition.paths.filter((path) => path.variant === variant)
    : definition.supportsVariants
      ? definition.paths.filter((path) => path.variant === "outline")
      : definition.paths;
  const labelled = Boolean(label);
  return (
    <svg
      {...props}
      className={className}
      data-icon-name={name}
      data-icon-variant={resolvedVariant}
      viewBox={definition.viewBox}
      width={size}
      height={size}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? label : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      fill="none"
      stroke="none"
    >
      {labelled ? <title>{label}</title> : null}
      {paths.map((path, index) => {
        const { d, variant: _variant, ...attributes } = path;
        return <path key={`${name}-${variant}-${index}`} d={d} {...attributes} />;
      })}
    </svg>
  );
}
