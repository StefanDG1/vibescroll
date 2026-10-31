// Iconoir v7.12.1, MIT. Copyright (c) 2021 Luca Burgio.
// Source: https://github.com/iconoir-icons/iconoir/tree/v7.12.1/icons/regular
// Selected original SVG paths only; see LICENSE.iconoir.txt. No icon runtime dependency.
import type { SVGProps } from "react";
type Props = SVGProps<SVGSVGElement> & { size?: number };
const paths = {
  "home-simple": [
    "M17 21H7C4.79086 21 3 19.2091 3 17V10.7076C3 9.30887 3.73061 8.01175 4.92679 7.28679L9.92679 4.25649C11.2011 3.48421 12.7989 3.48421 14.0732 4.25649L19.0732 7.28679C20.2694 8.01175 21 9.30887 21 10.7076V17C21 19.2091 19.2091 21 17 21Z",
    "M9 17H15",
  ],
  "book-stack": [
    "M5 19.5V5C5 3.89543 5.89543 3 7 3H18.4C18.7314 3 19 3.26863 19 3.6V21",
    "M9 7L15 7",
    "M6.5 15L19 15",
    "M6.5 18L19 18",
    "M6.5 21L19 21",
    "M6.5 18C5.5 18 5 17.3284 5 16.5C5 15.6716 5.5 15 6.5 15",
    "M6.5 21C5.5 21 5 20.3284 5 19.5C5 18.6716 5.5 18 6.5 18",
  ],
  folder: [
    "M2 11V4.6C2 4.26863 2.26863 4 2.6 4H8.77805C8.92127 4 9.05977 4.05124 9.16852 4.14445L12.3315 6.85555C12.4402 6.94876 12.5787 7 12.722 7H21.4C21.7314 7 22 7.26863 22 7.6V11M2 11V19.4C2 19.7314 2.26863 20 2.6 20H21.4C21.7314 20 22 19.7314 22 19.4V11M2 11H22",
  ],
  link: [
    "M14 11.9976C14 9.5059 11.683 7 8.85714 7C8.52241 7 7.41904 7.00001 7.14286 7.00001C4.30254 7.00001 2 9.23752 2 11.9976C2 14.376 3.70973 16.3664 6 16.8714C6.36756 16.9525 6.75006 16.9952 7.14286 16.9952",
    "M10 11.9976C10 14.4893 12.317 16.9952 15.1429 16.9952C15.4776 16.9952 16.581 16.9952 16.8571 16.9952C19.6975 16.9952 22 14.7577 22 11.9976C22 9.6192 20.2903 7.62884 18 7.12383C17.6324 7.04278 17.2499 6.99999 16.8571 6.99999",
  ],
  plus: ["M6 12H12M18 12H12M12 12V6M12 12V18"],
  "arrow-right": ["M3 12L21 12M21 12L12.5 3.5M21 12L12.5 20.5"],
  movie: [
    "M7 8.01L7.01 7.99889",
    "M17 8.01L17.01 7.99889",
    "M7 12.01L7.01 11.9989",
    "M17 12.01L17.01 11.9989",
    "M7 16.01L7.01 15.9989",
    "M17 16.01L17.01 15.9989",
    "M7 2H3.6C3.26863 2 3 2.26863 3 2.6V21.4C3 21.7314 3.26863 22 3.6 22H7M7 2V4M7 2H17M17 2H20.4C20.7314 2 21 2.26863 21 2.6V21.4C21 21.7314 20.7314 22 20.4 22H17M17 2V4M17 22V20M17 22H7M7 22V20",
  ],
  "sidebar-collapse": [
    "M19 21L5 21C3.89543 21 3 20.1046 3 19L3 5C3 3.89543 3.89543 3 5 3L19 3C20.1046 3 21 3.89543 21 5L21 19C21 20.1046 20.1046 21 19 21Z",
    "M7.25 10L5.5 12L7.25 14",
    "M9.5 21V3",
  ],
  "sidebar-expand": [
    "M19 21L5 21C3.89543 21 3 20.1046 3 19L3 5C3 3.89543 3.89543 3 5 3L19 3C20.1046 3 21 3.89543 21 5L21 19C21 20.1046 20.1046 21 19 21Z",
    "M9.5 21V3",
    "M5.5 10L7.25 12L5.5 14",
  ],
  "page-edit": [
    "M20 12V5.74853C20 5.5894 19.9368 5.43679 19.8243 5.32426L16.6757 2.17574C16.5632 2.06321 16.4106 2 16.2515 2H4.6C4.26863 2 4 2.26863 4 2.6V21.4C4 21.7314 4.26863 22 4.6 22H11",
    "M8 10H16M8 6H12M8 14H11",
    "M17.9541 16.9394L18.9541 15.9394C19.392 15.5015 20.102 15.5015 20.5399 15.9394V15.9394C20.9778 16.3773 20.9778 17.0873 20.5399 17.5252L19.5399 18.5252M17.9541 16.9394L14.963 19.9305C14.8131 20.0804 14.7147 20.2741 14.6821 20.4835L14.4394 22.0399L15.9957 21.7973C16.2052 21.7646 16.3988 21.6662 16.5487 21.5163L19.5399 18.5252M17.9541 16.9394L19.5399 18.5252",
    "M16 2V5.4C16 5.73137 16.2686 6 16.6 6H20",
  ],
} as const;
function icon(name: keyof typeof paths) {
  return function IconoirIcon({
    size = 20,
    strokeWidth = 1.5,
    ...props
  }: Props) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {paths[name].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  };
}
export const Home = icon("home-simple");
export const Library = icon("book-stack");
export const GitBranch = icon("folder");
export const Link2 = icon("link");
export const Plus = icon("plus");
export const ArrowRight = icon("arrow-right");
export const Plug = icon("link");
export const Video = icon("movie");
export const PanelLeftClose = icon("sidebar-collapse");
export const PanelLeftOpen = icon("sidebar-expand");
export const FileEdit = icon("page-edit");
export const Bookmark = icon("book-stack");
