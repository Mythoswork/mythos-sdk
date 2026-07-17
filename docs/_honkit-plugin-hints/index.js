/** Local HonKit plugin — renders GitBook {% hint %} blocks for local preview. */
module.exports = {
  blocks: {
    hint(block) {
      const style = block.kwargs.style || 'info';
      const body = this.renderBlock('markdown', block.body);
      return `<div class="alert alert-${style}">${body}</div>`;
    },
    tabs(block) {
      const body = this.renderBlock('markdown', block.body);
      return `<div class="tabs">${body}</div>`;
    },
  },
};
