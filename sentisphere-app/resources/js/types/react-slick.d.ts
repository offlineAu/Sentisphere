declare module "react-slick" {
  import * as React from "react";

  export interface Settings {
    accessibility?: boolean;
    adaptiveHeight?: boolean;
    arrows?: boolean;
    autoplay?: boolean;
    autoplaySpeed?: number;
    dots?: boolean;
    infinite?: boolean;
    speed?: number;
    slidesToShow?: number;
    slidesToScroll?: number;
    className?: string;
    responsive?: Array<{ breakpoint: number; settings: Settings }>;
    nextArrow?: React.ReactNode;
    prevArrow?: React.ReactNode;
    beforeChange?: (current: number, next: number) => void;
    afterChange?: (current: number) => void;
    [key: string]: unknown;
  }

  export default class Slider extends React.Component<Settings> {}
}
