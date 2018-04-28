const path = require('path');
const util = require('util');
const del = require('del');
const mkdirp = util.promisify(require('mkdirp'));
const jsonWrite = util.promisify(require('jsonfile').writeFile);
const moment = require('moment');
const splitArray = require('split-array');
const copyDir = require('copy-dir');
const globMd2data = require('glob-md2data');
const markdown = require('markdown-it')({ html: true });
const markdownImg = require('markdown-it-img');

module.exports = function (moduleOptions) {
  const defaultOptions = {
    inputDir: 'models',
    outputDir: 'static',
    lists: [
      { name: 'list', sort: (a, b) => moment(a.date).unix() < moment(b.date).unix() }
    ],
    markdown: [
      markdownImg((attr, value, env) => {
        if (attr === 'src') {
          return value.replace('./', `/models/${env.modelName}/`);
        }
      })
    ]
  };

  const options = Object.assign(defaultOptions, moduleOptions);

  // markdown plugin
  for (let plugin of options.markdown) {
    markdown.use(plugin);
  }

  const modelsDir = path.join(process.cwd(), options.inputDir);

  // convert md to json
  this.nuxt.hook('build:before', async () => {
    const outputDirPath = path.join(process.cwd(), options.outputDir, options.inputDir);

    await del(outputDirPath)
    await mkdirp(outputDirPath);

    const models = await globMd2data(modelsDir);
    for (let modelName in models) {
      const outputDirModelPath = path.join(outputDirPath, modelName);
      await mkdirp(outputDirModelPath);

      // copy images to static dir
      const inputImageDirPath = path.join(modelsDir, modelName, 'images');
      const outputImageDirPath = path.join(outputDirModelPath, 'images');
      try {
        copyDir.sync(inputImageDirPath, outputImageDirPath);

      // eslint-disable-next-line
      } catch (error) {}

      const mds = models[modelName];

      // write single model
      let tags = []
      let categories = []
      let authors = []
      for (let md of mds) {
        md.html = markdown.render(md.body, { modelName });
        await jsonWrite(`${path.join(outputDirModelPath, md.id)}.json`, md);
        if (categories.filter(category => category.name == md.category).length > 0) {
          categories.filter(category => category.name == md.category)[0].amount++
        } else {
          categories.push({name: md.category, amount: 1})
        }

        if (authors.filter(author => author.author_id == md.author_id).length > 0) {
          authors.filter(author => author.author_id == md.author_id)[0].amount++
        } else {
          authors.push({author_id: md.author_id, name: md.author, amount: 1})
        }
        for (let index in md.tags) {
          if (tags.filter(tag => tag.tag == md.tags[index]).length > 0) {
            tags.filter(tag => tag.tag == md.tags[index])[0].amount++
          } else {
            tags.push({tag: md.tags[index], amount: 1})
          }
        }
      }
      await jsonWrite(`${path.join(outputDirModelPath)}/authors.json`, authors);
      await jsonWrite(`${path.join(outputDirModelPath)}/categories.json`, categories);
      await jsonWrite(`${path.join(outputDirModelPath)}/tags.json`, tags);

      // write list models
      for (let sortData of options.lists) {
        const sorted = mds.sort(sortData.sort);

        if (sortData.limit) {
          const limted = splitArray(sorted, sortData.limit);
          for (let i = 0; i < limted.length; i++) {
            const basename = `${sortData.name}-${i}`;
            await jsonWrite(`${path.join(outputDirModelPath, basename)}.json`, limted[i]);
          }
        } else {
          await jsonWrite(`${path.join(outputDirModelPath, sortData.name)}.json`, sorted);
        }
      }
    }
  });

  // add model route
  this.nuxt.hook('generate:extendRoutes', async (routes) => {
    const models = await globMd2data(modelsDir);

    for (let modelName in models) {
      for (let md of models[modelName]) {
        routes.push({ route: `/${modelName}/${md.id}` });
        routes.push({ route: `/authors/${md.author_id}` });
        routes.push({ route: `/categories/${md.category}` });
        for (let tag in md.tags) {
          routes.push({ route: `/tags/${md.tags[tag]}` });
        }
      }
    }
  });
}
