/* nodes-html/widgets/index.js — the panel and nav widget node types.

   Importing this registers all of them, in the order omni-widget.js did,
   and gives the same exports.  Each type lives in <type>-widget.js; what
   they share (OmniWidget, WidgetContext, value and colour helpers,
   TAG_STYLES) is in widget-base.js.  layers-widget.js and
   topics-widget.js are loaded by their own users, as before. */

import { OmniWidget, WidgetContext, resolveWidgetType, createWidget, stripConfigs, parseDslValue, formatValue, isHexColor, parseHexColor, formatHexColor, lerpColor, _esc, covBar, TAG_STYLES } from './widget-base.js';
import { MorphSliderWidget } from './morph-slider-widget.js';
import { PanelWidget } from './panel-widget.js';
import { ControlGroupWidget } from './control-group-widget.js';
import { NavItemWidget } from './nav-item-widget.js';
import { NavLinkWidget } from './nav-link-widget.js';
import { NavCheckboxWidget } from './nav-checkbox-widget.js';
import { NavDividerWidget } from './nav-divider-widget.js';
import { NavSubmenuWidget } from './nav-submenu-widget.js';
import { ColorPickerWidget } from './color-picker-widget.js';
import { ButtonRowWidget } from './button-row-widget.js';
import { SliderGroupWidget } from './slider-group-widget.js';
import { PresetItemWidget } from './preset-item-widget.js';
import { OptionWidget } from './option-widget.js';
import { OptgroupWidget } from './optgroup-widget.js';
import { PresetWidget } from './presets-widget.js';
import { SelectWidget } from './select-widget.js';
import { ButtonWidget } from './button-widget.js';
import { ToggleWidget } from './toggle-widget.js';
import { FileDropWidget } from './filedrop-widget.js';
import { StatusWidget } from './status-widget.js';
import { InfoWidget } from './info-widget.js';
import { DynamicWidget } from './dynamic-widget.js';
import { CustomWidget } from './custom-widget.js';
import { AddBarWidget } from './addbar-widget.js';
import { DividerWidget } from './divider-widget.js';
import { LabelWidget } from './label-widget.js';
import { NumberInputWidget } from './number-input-widget.js';
import { TextInputWidget } from './text-input-widget.js';
import { ButtonGroupWidget } from './button-group-widget.js';

export {
  // Core framework
  OmniWidget,
  WidgetContext,
  resolveWidgetType,
  createWidget,
  stripConfigs,
  parseDslValue,

  // Structural
  PanelWidget,
  ControlGroupWidget,

  // Utilities
  formatValue,
  isHexColor,
  parseHexColor,
  formatHexColor,
  lerpColor,
  _esc,
  covBar,

  // Nav widget classes
  NavItemWidget,
  NavLinkWidget,
  NavCheckboxWidget,
  NavDividerWidget,
  NavSubmenuWidget,

  // Panel widget classes
  MorphSliderWidget,
  ColorPickerWidget,
  ButtonRowWidget,
  SliderGroupWidget,
  PresetItemWidget,
  PresetWidget,
  OptionWidget,
  OptgroupWidget,
  SelectWidget,
  ButtonWidget,
  ToggleWidget,
  FileDropWidget,
  StatusWidget,
  InfoWidget,
  DynamicWidget,
  CustomWidget,
  AddBarWidget,
  DividerWidget,
  LabelWidget,
  NumberInputWidget,
  TextInputWidget,
  ButtonGroupWidget,

  TAG_STYLES,
};

if (typeof window !== 'undefined') {
  window.OmniWidget = {
    OmniWidget, WidgetContext, createWidget, stripConfigs, parseDslValue,
    resolveWidgetType,
    formatValue, isHexColor, parseHexColor, formatHexColor, lerpColor,
    _esc, covBar, TAG_STYLES,
    NavItemWidget, NavLinkWidget, NavCheckboxWidget, NavDividerWidget, NavSubmenuWidget,
  };
}

