import { SYS } from '../omni-support/sys.js';
export { OrganiserModel };
class OrganiserModel {
  get name() { return 'Organiser'; }
  get displayType() { return 'none'; }

  constructor(models) {
    this.models = models;
    this.visible = true;
  }

  getControls(app) {
    const ctrls = [{ type: 'separator', label: 'Show / Hide Panels' }];
    this.models.forEach((m, i) => {
      if (m === this) return;
      let label = m.name || `Model ${i}`;
      label = label.split(/[.·]/)[0].trim();

      ctrls.push({
        type: 'checkbox',
        id: 'vis_' + i,
        label: label,
        value: m.visible !== false
      });
    });
    ctrls.push({ type: 'button', label: 'Apply Layout', cls: 'primary', action: () => app.buildLayout() });
    return ctrls;
  }
}
SYS.MODELS.push(new OrganiserModel(SYS.MODELS));
