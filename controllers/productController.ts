import { Request, Response, NextFunction } from "express";
import sharp from "sharp";
import { query } from "../db/db";
import catchAsync from "../utils/catchAsync";
import StatusError from "../utils/StatusError";
import cloudinaryImport, {
  UploadApiErrorResponse,
  UploadApiResponse,
} from "cloudinary";
import streamifier from "streamifier";
import { uploadFile, deleteFile } from "../utils/cloudFiles";
const cloudinary = cloudinaryImport.v2;
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
  secure: true,
});

export const randomProducts = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const result = await query(
      `SELECT product_id, title, description, price, images[1] as image, location, listed
        FROM product ORDER BY random() LIMIT 20`,
      []
    );
    res.json(result.rows);
  }
);

export const singleProduct = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const result = await query(
      `SELECT product_id, title, description, price, images, listed, location, app_user.username, category.name as category FROM product 
      JOIN category ON product.category_id = category.category_id
      JOIN app_user ON product.user_id = app_user.user_id
        WHERE product_id = $1`,
      [id]
    );

    if (!result.rows.length) {
      return next(new StatusError("Product not found", 404));
    }

    const product = result.rows[0];
    res.json(product);
  }
);

export const allProducts = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    let { page, count } = req.query;
    if (!page) {
      page = "1";
    }

    const offset = (Number(page) - 1) * 20;

    // Sort by most recent by default and limit to 20
    const result = await query(
      `SELECT product_id, title, description, price, images[1] as image, location, listed
        FROM product ORDER BY listed DESC LIMIT 20 OFFSET $1`,
      [offset]
    );

    // Get amount of products for pagination on front end
    if (result.rows.length < 20 && page === "1") {
      count = result.rows.length.toString();
    } else if (!count) {
      const countResult = await query(
        `SELECT COUNT(product_id) FROM product`,
        []
      );
      count = countResult.rows[0].count;
    }

    res.json({ products: result.rows, count });
  }
);

export const categoryProducts = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    let { page, count } = req.query;
    if (!page) {
      page = "1";
    }

    const { category_id } = req.params;

    const offset = (Number(page) - 1) * 20;

    // Sort by most recent by default and limit to 20
    const result = await query(
      `SELECT product_id, title, description, price, images[1] as image, location, listed
        FROM product 
        JOIN category on product.category_id = category.category_id
        WHERE category.category_id = $2
        ORDER BY listed DESC LIMIT 20 OFFSET $1`,
      [offset, category_id]
    );

    // Get amount of products for pagination on front end
    if (result.rows.length < 20 && page === "1") {
      count = result.rows.length.toString();
    } else if (!count) {
      const countResult = await query(
        `SELECT COUNT(product_id)
        FROM product         
        JOIN category on product.category_id = category.category_id
        WHERE category.category_id = $1`,
        [category_id]
      );
      count = countResult.rows[0].count;
    }

    res.json({ products: result.rows, count });
  }
);

export const searchProducts = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    let { page, count, q, category: category_id } = req.query;
    if (!page) {
      page = "1";
    }

    const offset = (Number(page) - 1) * 20;

    // Add category filter to query if included in search
    let result;
    if (category_id) {
      result = await query(
        `SELECT product_id, title, description, price, images[1] as image, location, listed
          FROM product 
          WHERE (LOWER(title) LIKE $2 OR LOWER(description) LIKE $2) AND category_id = $3
          ORDER BY listed DESC LIMIT 20 OFFSET $1`,
        [offset, `%${(q as string).toLowerCase()}%`, category_id]
      );
    } else {
      // Sort by most recent by default and limit to 20
      result = await query(
        `SELECT product_id, title, description, price, images[1] as image, location, listed
          FROM product 
          WHERE LOWER(title) LIKE $2 OR LOWER(description) LIKE $2
          ORDER BY listed DESC LIMIT 20 OFFSET $1`,
        [offset, `%${(q as string).toLowerCase()}%`]
      );
    }

    // Get amount of products for pagination on front end
    if (result.rows.length < 20 && page === "1") {
      // Skip if less than 20 total results
      count = result.rows.length.toString();
    } else if (!count) {
      if (category_id) {
        const countResult = await query(
          `SELECT COUNT(product_id) FROM product
          WHERE (LOWER(title) LIKE $1 OR LOWER(description) LIKE $1) AND category_id = $2`,
          [`%${(q as string).toLowerCase()}%`, category_id]
        );
        count = countResult.rows[0].count;
      } else {
        const countResult = await query(
          `SELECT COUNT(product_id) FROM product
          WHERE LOWER(title) LIKE $1 OR LOWER(description) LIKE $1`,
          [`%${(q as string).toLowerCase()}%`]
        );
        count = countResult.rows[0].count;
      }
    }

    res.json({ products: result.rows, count });
  }
);

export const newProduct = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    req.files = req.files as Express.Multer.File[];
    // Send error if more than 3 files
    if (req.files.length > 3) {
      next(new StatusError("Maximum of 3 images allowed", 400));
    }

    // Upload images to cloudinary
    const images = [];
    if (req.files) {
      for (let file of req.files) {
        const imageBuffer = await sharp(file.buffer)
          .resize(800, 800, { fit: "inside" })
          .webp()
          .toBuffer();

        const uploadResponse = await uploadFile(imageBuffer);
        images.push((uploadResponse as UploadApiResponse).url);
      }
    }

    const { category_id, title, description, price, location } = req.body;

    const result = await query(
      `INSERT INTO product(user_id, category_id, title, description, price, images, listed, location)
      VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING product_id`,
      [1, category_id, title, description, price, images, new Date(), location]
    );

    res.json(result.rows[0]);
  }
);

export const deleteProduct = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const result = await query(
      `DELETE FROM product WHERE product_id = $1 RETURNING images`,
      [id]
    );

    if (!result.rows.length) {
      return next(new StatusError("Product not found", 404));
    }

    // Delete images from cloudinary
    const images = result.rows[0].images;
    for (let image of images) {
      await deleteFile(image);
    }

    res.send();
  }
);

export const updateProduct = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    req.files = req.files as Express.Multer.File[];
    // Send error if more than 3 files
    if (req.files.length > 3) {
      next(new StatusError("Maximum of 3 images allowed", 400));
    }

    const { id } = req.params;
    const { category_id, title, description, price, location, updatedImages } =
      req.body;

    // Update the stored images
    for (let file of req.files) {
      // Find first file marked to be changed with exclamation mark
      const emptyIndex = updatedImages.findIndex(
        (el: string) => el.startsWith("!") || el === ""
      );

      // If an empty image to be changed exists
      if (emptyIndex !== -1) {
        const imageBuffer = await sharp(file.buffer)
          .resize(800, 800, { fit: "inside" })
          .webp()
          .toBuffer();

        // Upload new image
        const imageUpload = await uploadFile(imageBuffer);

        // Delete old image
        await deleteFile(updatedImages[emptyIndex].slice(1));

        // Set new image url
        updatedImages[emptyIndex] = (imageUpload as UploadApiResponse).url;
      }
    }
  
    const result = await query(
      `UPDATE product
        SET title = $2, category_id = $3, description = $4, price = $5, location = $6, images = $7
        WHERE product_id = $1 RETURNING product_id`,
      [
        id,
        title,
        category_id,
        description,
        price,
        location,
        updatedImages.filter((el: string) => el !== ""),
      ]
    );

    res.json({ product_id: id });
  }
);
