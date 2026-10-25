/**
 * Classes:
 * -  CardSetNode    – renders a grid of styled cards via CSS injection
 */

// ============================================================
//  CardSetNode
// ============================================================

import { MiniAstNode, sceneRegistry  } from '../omni-support/scene.js';

class  CardSetNode {
  constructor(container, cardData) {
    //super(container);
    this.container=container;
    this.cardData = cardData;
    this.cards = [];
    this.styleElement = document.getElementById('ocard-styles');
    this.build();
  }
  
  setCardData(newData) {
    this.cardData = newData;
    this.build();
  }
  
  build() {
    this.container.innerHTML = '';
    this.cards = [];
    
    this.cardData.forEach((data, index) => {
      const card = document.createElement('div');
      card.className = 'ocard';
      
      // Card number
      const number = document.createElement('div');
      number.className = 'ocard-number';
      number.textContent = `#${index + 1}`;
      
      // Heading (first item)
      const heading = document.createElement('div');
      heading.className = 'ocard-heading';
      heading.textContent = data[0] || '';
      
      // Divider
      const divider = document.createElement('div');
      divider.className = 'ocard-divider';
      
      // Body (remaining items)
      const body = document.createElement('div');
      body.className = 'ocard-body';
      
      // Add body items (columns 1+)
      for (let i = 1; i < data.length; i++) {
        if (data[i]) {
          const item = document.createElement('div');
          item.className = 'ocard-body-item';
          item.textContent = data[i];
          // Alternate styling for multi-column data
          if (i % 2 === 0) {
            item.dataset.alternate = 'true';
          }
          body.appendChild(item);
        }
      }
      
      card.appendChild(number);
      card.appendChild(heading);
      card.appendChild(divider);
      card.appendChild(body);
      
      this.container.appendChild(card);
      this.cards.push({ element: card, heading, divider, body, number });
    });
  }
  
  // updates parameters
  update(params) {
    // Generate CSS from parameters and inject it
    const css = this.generateDynamicCSS(params);
    this.styleElement.textContent = css;
  }
  
  generateDynamicCSS(p) {
    return `
/* Card container and layout */
.ocard {
  width: ${p.cardWidth}px;
  height: ${p.cardHeight}px;
  padding: ${p.padding}px;
  justify-content: ${this.getAlignment(p.alignV)};
  align-items: ${this.getAlignment(p.alignH)};
  text-align: ${this.getTextAlign(p.alignH)};
  
  /* Background */
  background-color: ${this.hsl(p.bgHue, p.bgSat, p.bgLight, p.bgOpacity)};
  
  /* Border */
  border-radius: ${p.borderRadius}px;
  ${p.borderWidth > 0 ? `border: ${p.borderWidth}px solid ${this.hsl(p.borderHue, 50, 50, p.borderOpacity)};` : ''}
  
  /* Shadow */
  ${(p.shadowBlur > 0 || p.shadowX !== 0 || p.shadowY !== 0) ? 
    `box-shadow: ${p.shadowX}px ${p.shadowY}px ${p.shadowBlur}px rgba(0, 0, 0, ${p.shadowOpacity});` : ''}
  
  /* Effects */
  ${p.backdropBlur > 0 ? `
  backdrop-filter: blur(${p.backdropBlur}px);
  -webkit-backdrop-filter: blur(${p.backdropBlur}px);` : ''}
  ${p.saturation !== 1 || p.brightness !== 1 ? `
  filter: ${[
    p.saturation !== 1 ? `saturate(${p.saturation})` : '',
    p.brightness !== 1 ? `brightness(${p.brightness})` : ''
  ].filter(Boolean).join(' ')};` : ''}
}

/* Heading */
.ocard-heading {
  font-size: ${p.headingSize}px;
  font-weight: ${p.headingWeight};
  letter-spacing: ${p.headingSpacing}px;
  line-height: ${p.headingLineHeight};
  color: ${this.hsl(p.headingHue, p.headingSat, p.headingLight)};
  opacity: ${p.headingOpacity};
  margin-bottom: ${p.contentGap}px;
}

/* Divider */
.ocard-divider {
  height: ${p.dividerHeight}px;
  width: ${p.dividerWidth}%;
  background: ${this.hsl(p.dividerHue, p.dividerSat, p.dividerLight, p.dividerOpacity)};
  margin-top: ${p.dividerTopMargin}px;
  margin-bottom: ${p.contentGap}px;
}

/* Body */
.ocard-body-item {
  font-size: ${p.bodySize}px;
  font-weight: ${p.bodyWeight};
  letter-spacing: ${p.bodySpacing}px;
  line-height: ${p.bodyLineHeight};
  color: ${this.hsl(p.bodyHue, p.bodySat, p.bodyLight)};
  opacity: ${p.bodyOpacity};
  margin-bottom: 8px;
}

/* Alternate body items */
.ocard-body-item[data-alternate="true"] {
  opacity: ${p.bodyOpacity * 0.85};
  font-weight: ${Math.max(100, p.bodyWeight - 100)};
}
`;
  }
  
  // Helper functions
  getAlignment(value) {
    if (value <= 0.33) return 'flex-start';
    if (value <= 0.67) return 'center';
    return 'flex-end';
  }
  
  getTextAlign(value) {
    if (value <= 0.33) return 'left';
    if (value <= 0.67) return 'center';
    return 'right';
  }
  
  hsl(h, s, l, a = 1) {
    return a < 1 ? `hsla(${h}, ${s}%, ${l}%, ${a})` : `hsl(${h}, ${s}%, ${l}%)`;
  }
  
  // Export functions
  generateCSS(params) {
    const p = params;
    
    return `.ocard {
  /* Dimensions */
  width: ${p.cardWidth}px;
  height: ${p.cardHeight}px;
  padding: ${p.padding}px;
  
  /* Layout */
  display: flex;
  flex-direction: column;
  justify-content: ${this.getAlignment(p.alignV)};
  align-items: ${this.getAlignment(p.alignH)};
  text-align: ${this.getTextAlign(p.alignH)};
  
  /* Background */
  background-color: ${this.hsl(p.bgHue, p.bgSat, p.bgLight, p.bgOpacity)};
  
  /* Border */
  border-radius: ${p.borderRadius}px;${p.borderWidth > 0 ? `
  border: ${p.borderWidth}px solid ${this.hsl(p.borderHue, 50, 50, p.borderOpacity)};` : ''}
  
  /* Shadow */
  ${(p.shadowBlur > 0 || p.shadowX !== 0 || p.shadowY !== 0) ? 
    `box-shadow: ${p.shadowX}px ${p.shadowY}px ${p.shadowBlur}px rgba(0, 0, 0, ${p.shadowOpacity});` : ''}
  
  /* Effects */
  ${p.backdropBlur > 0 ? `backdrop-filter: blur(${p.backdropBlur}px);
  -webkit-backdrop-filter: blur(${p.backdropBlur}px);` : ''}
  ${p.saturation !== 1 || p.brightness !== 1 ? 
    `filter: ${[
      p.saturation !== 1 ? `saturate(${p.saturation})` : '',
      p.brightness !== 1 ? `brightness(${p.brightness})` : ''
    ].filter(Boolean).join(' ')};` : ''}
  
  /* Interaction */
  position: relative;
  transition: transform 0.2s;
  overflow: hidden;
}

.ocard:hover {
  transform: translateY(-2px);
}

.ocard-heading {
  font-size: ${p.headingSize}px;
  font-weight: ${p.headingWeight};
  letter-spacing: ${p.headingSpacing}px;
  line-height: ${p.headingLineHeight};
  color: ${this.hsl(p.headingHue, p.headingSat, p.headingLight)};
  opacity: ${p.headingOpacity};
  margin-bottom: ${p.contentGap}px;
}

.ocard-divider {
  height: ${p.dividerHeight}px;
  width: ${p.dividerWidth}%;
  background: ${this.hsl(p.dividerHue, p.dividerSat, p.dividerLight, p.dividerOpacity)};
  margin-top: ${p.dividerTopMargin}px;
  margin-bottom: ${p.contentGap}px;
}

.ocard-body {
  flex: 1;
  overflow-y: auto;
}

.ocard-body-item {
  font-size: ${p.bodySize}px;
  font-weight: ${p.bodyWeight};
  letter-spacing: ${p.bodySpacing}px;
  line-height: ${p.bodyLineHeight};
  color: ${this.hsl(p.bodyHue, p.bodySat, p.bodyLight)};
  opacity: ${p.bodyOpacity};
  margin-bottom: 8px;
}

.ocard-body-item:last-child {
  margin-bottom: 0;
}

/* Alternate styling for multi-column data */
.ocard-body-item[data-alternate="true"] {
  opacity: ${p.bodyOpacity * 0.85};
  font-weight: ${Math.max(100, p.bodyWeight - 100)};
}`;
  }
  
  generateSampleHTML() {
    const sample = this.cardData[0] || ['Sample Heading', 'Sample body text'];
    
    return `<div class="ocard">
  <div class="ocard-heading">${this.escapeHtml(sample[0])}</div>
  <div class="ocard-divider"></div>
  <div class="ocard-body">
${sample.slice(1).map(text => `    <div class="ocard-body-item">${this.escapeHtml(text)}</div>`).join('\n')}
  </div>
</div>`;
  }
}

sceneRegistry.registerNodeClass('card-set', CardSetNode);

export { CardSetNode }

