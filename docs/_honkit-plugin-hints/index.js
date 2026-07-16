/** Local HonKit plugin — renders GitBook {% hint %} blocks for local preview. */
module.exports = {
  blocks: {
    async hint(block) {
      const style = block.kwargs.style || 'info';
      const body = await this.renderBlock('markdown', block.body);
      return `<div class="alert alert-${style}">${body}</div>`;
    },
    async tabs(block) {
      const body = await this.renderBlock('markdown', block.body);
      return `<div class="tabs">${body}</div>`;
    },
  },
};
