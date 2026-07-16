import { notFound } from "next/navigation";
import { categoryFromSlug } from "@/lib/categories";
import { CategoryDetail } from "@/components/money/category-detail";

export const metadata = { title: "Category — Money" };

export default function Page({ params }: { params: { slug: string } }) {
  const category = categoryFromSlug(params.slug);
  if (!category) return notFound();
  return (
    <div className="space-y-5 py-2">
      <CategoryDetail category={category} />
    </div>
  );
}
