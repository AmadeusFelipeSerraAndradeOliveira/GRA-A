// Public Cloudinary configuration for unsigned browser uploads.
// The preset must be created as unsigned and restricted to image types and
// the `graca/products` folder in Cloudinary Console before uploads can work.
export const CLOUDINARY_CONFIG = Object.freeze({
  cloudName: 'imc3dn7g',
  uploadPreset: 'graca_products_unsigned_v1'
});

