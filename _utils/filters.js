const htmlmin = require("html-minifier");

function escape(s) {
  return ('' + s) /* Forces the conversion to string. */
      .replace(/\\/g, '\\\\') /* This MUST be the 1st replacement. */
      .replace(/\t/g, '\\t') /* These 2 replacements protect whitespaces. */
      .replace(/\n/g, '\\n')
      .replace(/\u00A0/g, '\\u00A0') /* Useful but not absolutely necessary. */
      .replace(/&/g, '\\x26') /* These 5 replacements protect from HTML/XML. */
      .replace(/'/g, '\\x27')
      .replace(/"/g, '\\x22')
      .replace(/</g, '\\x3C')
      .replace(/>/g, '\\x3E')
      ;
}

const slugify = ( text ) => {
  return text
  .toString()
  .normalize( 'NFD' )                   // split an accented letter in the base letter and the acent
  .replace( /[\u0300-\u036f]/g, '' )   // remove all previously split accents
  .toLowerCase()
  .trim()
  .replace(/\s+/g, '-')
  .replace(/[^\w\-]+/g, '')
  .replace(/\-\-+/g, '-'); 
};

const collections = require('../_config/collections.json');

const { format } = require('date-fns');

const { getProperty } = require('./get');

const { memoize, findBySlug } = require('./memo');

const { chunk } = require('./chunk');

module.exports = function (eleventyConfig, ecommerceFormat, priceTemplate) {

  if (!ecommerceFormat) {
    ecommerceFormat = { currencyCode: "USD", symbol: "$", decimal: ".", fractionDigits: 2, group: ",", template: `{{wf {"path":"symbol","type":"PlainText"} }} {{wf {"path":"amount","type":"CommercePrice"} }} {{wf {"path":"currencyCode","type":"PlainText"} }}` };
  }

  eleventyConfig.addCollection("memoized", function (collection) {
    return memoize(collection.getAll());
  });


  for (let collectionId in collections) {
    const collection = collections[collectionId];

    if (collection.paginationLimit) {
      eleventyConfig.addCollection(collectionId + "_paged", function (collectionApi) {

        const newCollections = {}
        
        let items = collectionApi.getFilteredByTag(collection.collection);

        let limit = 0;

        if (collection.query && collection.query.limit) {
          limit = collection.query.limit;
        }
        if (collection.paginationLimit) {
          limit = collection.paginationLimit;
          // Create pagination Files
        }

        if (collection.query && collection.query.fields) {
          for (let field of collection.query.fields) {
            const rawItems = items;
            if (!(field.value + "").includes("DYN_CONTEXT")) {
              items = items.filter(item => {
                const value = getProperty(item.data, field.fieldPath, "");
                try {
                  if (field.value == "true") {
                    field.value = true;
                  } else if (field.value == "false") {
                    field.value = false;
                  }
                  switch (field.operatorName) {
                    case "eq":
                      return value == field.value;
                    case "gt":
                      return value > field.value;
                    case "gte":
                      return value >= field.value;
                    case "lt":
                      return value < field.value;
                    case "lte":
                      return value <= field.value;
                    case "ne":
                      return value != field.value;
                    case "in": case "idin":
                      return value.includes(field.value);
                    case "nin": case "nidin":
                      return !value.includes(field.value);
                    case "exists":
                      if (field.value = "yes") {
                        return !!value;
                      } else {
                        return !(!!value);
                      }
                  }
                } catch (e) {
                  return false;
                }
                return false;
              });
            } else {

              items.forEach(item => {
                let a = getProperty(item.data, field.fieldPath, getProperty(item.data, "slug", undefined));
                
                if (a) {
                  if (!a.includes("/")) {
                    const s = a;
                    a = collection.collection + "/" + a;
                    const index = ("/" + a).replace('.md', '') + "_ne";
                    if (field.operatorName == "ne") {
                      items.forEach(item => {
                        const itemS = getProperty(item.data, "slug", undefined);
                        if (itemS !== s) {
                          if (!newCollections[index]) {
                            newCollections[index] = []
                          }
                          newCollections[index].push(item);
                        }
                      })
                    }
                  }
                  const index = ("/" + a).replace('.md', '');
                  if (!newCollections[index]) {
                    newCollections[index] = []
                  }
                  newCollections[index].push(item);
                }
              });
            }
          }
        }
        if (collection.query && collection.query.sort) {
          for (let sortType of collection.query.sort) {
            let neg = sortType.startsWith("-");
            const fieldPath = sortType.startsWith("-") ? sortType.substring(1) : sortType;

            items = items.sort((a, b) => {
              const aField = getProperty(a.data, fieldPath, "");
              const bField = getProperty(b.data, fieldPath, "");

              if (neg) {
                return aField > bField ? -1 : 1;
              } else {
                return aField > bField ? 1 : -1;
              }
            });
          }
        }

        newCollections['main'] = items;

        const pagedCollections = []

        for (let cid in newCollections) {
          const chunks = chunk(newCollections[cid], collection.paginationLimit);
          const max = chunks.length - 1;
          chunks.forEach((c, i) => {
            pagedCollections.push({
              permalink: `pagination/${collectionId}-${cid}/page-${i + 1}.json`,
              prev: i > 0 ? `pagination/${collectionId}-${cid}/page-${i}.json` : "",
              next: i < max ? `pagination/${collectionId}-${cid}/page-${i + 2}.json` : "",
              items: c
            });
          })

        }

        return pagedCollections;
      })
    }

    eleventyConfig.addCollection(collectionId, function (collectionApi) {

      const newCollections = {}
      let items = collectionApi.getFilteredByTag(collection.collection);


      let limit = 0;

      if (collection.query && collection.query.limit) {
        limit = collection.query.limit;
      }
      if (collection.paginationLimit) {
        limit = collection.paginationLimit;
        // Create pagination Files
      }

      if (collection.query && collection.query.fields) {
        const rawItems = items;
        for (let field of collection.query.fields) {
          if (!(field.value + "").includes("DYN_CONTEXT")) {
            items = items.filter(item => {
              let value = getProperty(item.data, field.fieldPath, "");
              try {
                if (field.value == "true") {
                  field.value = true;
                } else if (field.value == "false") {
                  field.value = false;
                }
                switch (field.operatorName) {
                  case "eq":
                    return value == field.value;
                  case "gt":
                    return value > field.value;
                  case "gte":
                    return value >= field.value;
                  case "lt":
                    return value < field.value;
                  case "lte":
                    return value <= field.value;
                  case "ne":
                    return value != field.value;
                  case "in": case "idin":
                    return value.includes(field.value);
                  case "nin": case "nidin":
                    return !value.includes(field.value);
                  case "exists":
                    if (field.value = "yes") {
                      return !!value;
                    } else {
                      return !(!!value);
                    }
                }
              } catch (e) {
                return false;
              }
              return false;
            });
          } else {
            items.forEach(item => {
              let a = getProperty(item.data, field.fieldPath, getProperty(item.data, "slug", undefined));
              
              if (a) {
                if (!a.includes("/")) {
                  const s = a;
                  a = collection.collection + "/" + a;
                  const index = ("/" + a).replace('.md', '') + "_ne";
                  if (field.operatorName == "ne") {
                    items.forEach(item => {
                      const itemS = getProperty(item.data, "slug", undefined);
                      if (itemS !== s) {
                        if (!newCollections[index]) {
                          newCollections[index] = []
                        }
                        newCollections[index].push(item);
                      }
                    })
                  }
                }
                const index = ("/" + a).replace('.md', '');
                if (!newCollections[index]) {
                  newCollections[index] = []
                }
                newCollections[index].push(item);
              }
            });
          }
        }
      }
      if (collection.query && collection.query.sort) {
        for (let sortType of collection.query.sort) {
          let neg = sortType.startsWith("-");
          const fieldPath = sortType.startsWith("-") ? sortType.substring(1) : sortType;

          items = items.sort((a, b) => {
            const aField = getProperty(a.data, fieldPath, "");
            const bField = getProperty(b.data, fieldPath, "");

            if (neg) {
              return aField > bField ? -1 : 1;
            } else {
              return aField > bField ? 1 : -1;
            }
          });
        }
      }

      if (limit > 0) {
        const offset = collection.query ? collection.query.offset || 0 : 0;
        items = items.slice(offset, limit + offset)
      }

      newCollections['main'] = items;
      return newCollections;
    })
  }


  eleventyConfig.addTransform("htmlmin", function (content, outputPath) {
    if (outputPath.endsWith(".html")) {
      try {
        let minified = htmlmin.minify(content, {
          useShortDoctype: true,
          removeComments: true,
          collapseWhitespace: true
        });
        return minified;
      } catch(e) {
        return content;
      }
    }

    return content;
  });

  eleventyConfig.addLiquidShortcode("seo", function (seo) {
    let seoString = '';
    for (let key in seo) {
      switch (key) {
        case 'title':
          seoString += `<title>${escape(seo.title)}</title><meta property="og:title" content="${escape(seo.title)}" />`;
          break;
        case 'description':
          seoString += `<meta name="description" content="${escape(seo.description)}">`;
          break;
        default: {
          if (key == 'additional_tags') {
            seoString += seo.additional_tags;
          } else if (key.startsWith('og:')) {
            seoString += `<meta property="${escape(key)}" content="${escape(seo[key])}">`;
          } else {
            seoString += `<meta name="${escape(key)}" content="${escape(seo[key])}">`;
          }
          break;
        }
      }
    }

    return seoString;
  });

  eleventyConfig.addCollection("_variations", function (collectionApi) {

    let products = {};

    let items = collectionApi.getFilteredByTag("product");

    let skus = collectionApi.getFilteredByTag("sku");

    items.forEach(product => {
      const properties = product.data['sku-properties'] || [];

      const productSlug = `product/${product.data.slug}.md`;
      const variations = skus.filter(sku =>
        sku.data.product == productSlug
      ).map(sku => {
        let skuValues = (sku.data['sku-values'] || []);
                  if (Array.isArray(skuValues)) {
                    let obj = {};
                    skuValues.forEach( val => {
                      obj[val.property] = slugify(val.name)
                    })
                    skuValues = obj;
                  }
        return {
          id: sku.data.slug,
          slug: sku.data.slug,
          url: '/data/sku/' + sku.data.slug + '.json',
          price: sku.data.price,
          compareAtPrice: sku.data['compare-at-price'],
          "sku-values": skuValues,
          "main-image": sku.data['main-image'],
          name: sku.data.name
        }
      });
      const item = {
        variationsData: {
          slug: product.data.slug,
          defaultSku: '/data/' + product.data['default-sku'].replace('md', 'json'),
          properties,
          variations
        }

      }

      products[product.data.slug] = item;
    });

    return products;
  });

  eleventyConfig.addLiquidFilter('resolveReference', function (item, field, fieldType) {

    const itemField = item.data[field]
    let ref = {};
    if (itemField) {

      if (typeof itemField == "string") {

        let refSlug = itemField.includes('.md') ? itemField.split('/')[1].replace('.md', '') : itemField;
        if (!fieldType) {
          itemField.split('/')[0]
        }

        ref = findBySlug(fieldType, refSlug);
      }
    }

    return ref;
  })

  eleventyConfig.addLiquidFilter('escape', function(t) {
    return escape(t);
  })

  eleventyConfig.addLiquidFilter('resolveMultiReference', function (item, field, fieldType) {

    const itemField = item.data[field]
    let ref = [];
    if (itemField && Array.isArray(itemField)) {

      ref = itemField.map(e => {
        let refSlug = e.includes('.md') ? e.split('/')[1].replace('.md', '') : e;
        if (!fieldType) {
          e.split('/')[0]
        }
        findBySlug(fieldType, refSlug);
      });

    }

    return ref;
  })

  eleventyConfig.addLiquidFilter('getBySlug', function (type, slug) {
    return findBySlug(type, slug);
  })

  eleventyConfig.addLiquidFilter('getCurrentPageItem', function (page) {
    const [type, slug] = page.filePathStem.split('/').filter(e => !!e);
    return findBySlug(type, slug);
  })

  eleventyConfig.addLiquidFilter('json', function (value) {
    return JSON.stringify(value);
  });

  eleventyConfig.addLiquidFilter('slugify', function (value) {
    return slugify(value);
  });

  eleventyConfig.addLiquidFilter('formatPrice', function (price) {
    if (!price) {
      return "";
    }

    const amount = (price.value / 100).toLocaleString('en-UK', { minimumFractionDigits: ecommerceFormat.hideDecimalForWholeNumbers ? 0 : ecommerceFormat.fractionDigits, maximumFractionDigits: ecommerceFormat.fractionDigits }).replace(/,/gm, ecommerceFormat.group || ',').replace(/\./gm, ecommerceFormat.decimal || '.')

    return priceTemplate(amount, price.unit);
  });

  eleventyConfig.addLiquidFilter('formatAmount', function (amount, decimalCount = 2, decimal = ".", thousands = ",") {
    amount = amount / 100;
    try {
      decimalCount = Math.abs(decimalCount);
      decimalCount = isNaN(decimalCount) ? 2 : decimalCount;

      const negativeSign = amount < 0 ? "-" : "";

      let i = parseInt(amount = Math.abs(Number(amount) || 0).toFixed(decimalCount)).toString();
      let j = (i.length > 3) ? i.length % 3 : 0;

      return negativeSign + (j ? i.substr(0, j) + thousands : '') + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + thousands) + (decimalCount ? decimal + Math.abs(amount - i).toFixed(decimalCount).slice(2) : "");
    } catch (e) {
      return amount;
    }
  })


  eleventyConfig.addLiquidFilter('filterBy', function (array, toFilter, field) {
    if (!Array.isArray(toFilter)) {
      toFilter = [toFilter];
    }
    if (!array) {
      return [];
    }
    return array.filter(item => {
      if (field in item) {
        let value = item[field];
        if (!Array.isArray(value)) {
          value = [value];
        }
        for (let f of toFilter) {
          if (value.includes(f)) {
            return true;
          }
        }
        return false;
      } else {
        return false;
      }
    });
  });

  eleventyConfig.addLiquidFilter('formatDate', function (date, formatString = "yyyy-MM-dd") {
    try {
      const d = new Date(date);
      return format(d, formatString);
    } catch (error) {
      const d = new Date(date);
      return format(d, "yyyy-MM-dd");
    }
  });

  eleventyConfig.addLiquidFilter('limit', function (array, limit, offset) {
    if (!array) {
      return [];
    }
    if (!offset || isNaN(offset)) {
      offset = 0;
    }

    return array.slice(offset, limit);

  });

};
