import { HeroBanner } from "@/components/loja/hero-banner"
import { CategoryPills } from "@/components/loja/category-pills"
import { FeaturedSection } from "@/components/loja/featured-section"
import { CourseGrid } from "@/components/loja/course-grid"

export default function LojaHomePage() {
  return (
    <>
      <HeroBanner />
      <CategoryPills />
      <FeaturedSection />
      <CourseGrid />
    </>
  )
}
