import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { BookOpen, Clock, Award, PlayCircle, FileText, CheckCircle, Lock } from "lucide-react";

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string;
  thumbnail: string;
  category: string;
  difficulty: string;
  estimatedHours: number;
  isPublished: boolean;
  orderIndex: number;
  progress?: {
    completionPercentage: number;
    isCompleted: boolean;
  };
}

export default function LearningCenterPage() {
  const userId = localStorage.getItem("userId");

  const { data, isLoading } = useQuery<{ courses: Course[] }>({
    queryKey: ["/api/learning/courses", userId],
  });

  const courses = data?.courses || [];

  const categories = Array.from(new Set(courses.map((c) => c.category)));
  const allCategories = ["all", ...categories];

  const getCoursesByCategory = (category: string) => {
    if (category === "all") return courses;
    return courses.filter((c) => c.category === category);
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-64" />
            <div className="h-4 bg-muted rounded w-96" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-80 bg-muted rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto" data-testid="page-learning-center">
      <div className="p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Learning Center
          </h1>
          <p className="text-muted-foreground mt-2">
            Expand your skills with our comprehensive training courses
          </p>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList data-testid="tabs-categories">
            {allCategories.map((category) => (
              <TabsTrigger
                key={category}
                value={category}
                data-testid={`tab-${category}`}
                className="capitalize"
              >
                {category}
              </TabsTrigger>
            ))}
          </TabsList>

          {allCategories.map((category) => (
            <TabsContent key={category} value={category} className="mt-6">
              {getCoursesByCategory(category).length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No courses available</h3>
                    <p className="text-muted-foreground">
                      Check back later for new courses in this category
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {getCoursesByCategory(category).map((course) => (
                    <CourseCard key={course.id} course={course} />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

function CourseCard({ course }: { course: Course }) {
  const progress = course.progress?.completionPercentage || 0;
  const isCompleted = course.progress?.isCompleted || false;
  const isStarted = progress > 0;

  const difficultyColors = {
    beginner: "bg-green-500/10 text-green-700 dark:text-green-400",
    intermediate: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    advanced: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  };

  return (
    <Link href={`/learning/courses/${course.slug}`}>
      <Card
        className="group cursor-pointer hover-elevate active-elevate-2 h-full flex flex-col"
        data-testid={`card-course-${course.id}`}
      >
        <div className="relative aspect-video bg-muted overflow-hidden rounded-t-lg">
          {course.thumbnail ? (
            <img
              src={course.thumbnail}
              alt={course.title}
              className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <BookOpen className="h-16 w-16 text-muted-foreground" />
            </div>
          )}
          {isCompleted && (
            <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-2">
              <CheckCircle className="h-5 w-5" />
            </div>
          )}
        </div>

        <CardHeader className="flex-1">
          <div className="flex items-start justify-between gap-2 mb-2">
            <Badge
              variant="secondary"
              className={difficultyColors[course.difficulty as keyof typeof difficultyColors]}
              data-testid={`badge-difficulty-${course.id}`}
            >
              {course.difficulty}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              {course.estimatedHours}h
            </Badge>
          </div>
          
          <CardTitle className="line-clamp-2" data-testid={`text-course-title-${course.id}`}>
            {course.title}
          </CardTitle>
          
          <CardDescription className="line-clamp-3">
            {course.description}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isStarted ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium" data-testid={`text-progress-${course.id}`}>
                  {Math.round(progress)}%
                </span>
              </div>
              <Progress value={progress} className="h-2" />
              <Button
                className="w-full mt-2"
                variant={isCompleted ? "outline" : "default"}
                data-testid={`button-continue-${course.id}`}
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                {isCompleted ? "Review Course" : "Continue Learning"}
              </Button>
            </div>
          ) : (
            <Button className="w-full" data-testid={`button-start-${course.id}`}>
              <PlayCircle className="h-4 w-4 mr-2" />
              Start Course
            </Button>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
