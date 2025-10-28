import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Edit, Trash2, BookOpen, Eye, Globe, FileText } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  difficulty: string;
  estimatedDuration: number;
  isPublished: boolean;
  order: number;
  lessonCount?: number;
}

export default function AdminLearningDashboard() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ courses: Course[] }>({
    queryKey: ["/api/learning/courses"],
    queryFn: async () => {
      // Admins should see all courses (including unpublished)
      const response = await fetch("/api/learning/courses?isPublished=all", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch courses");
      const coursesData = await response.json();
      
      const coursesWithLessons = await Promise.all(
        coursesData.courses.map(async (course: Course) => {
          const lessonsResponse = await fetch(`/api/admin/learning/courses/${course.id}/lessons`, { credentials: "include" });
          const lessonsData = await lessonsResponse.json();
          return { ...course, lessonCount: lessonsData.lessons?.length || 0 };
        })
      );
      
      return { courses: coursesWithLessons };
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (courseId: string) => {
      await apiRequest("DELETE", `/api/admin/learning/courses/${courseId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/learning/courses"] });
      toast({
        title: "Course deleted",
        description: "The course has been removed successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete course.",
        variant: "destructive",
      });
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ courseId, isPublished }: { courseId: string; isPublished: boolean }) => {
      return await apiRequest(`/api/admin/learning/courses/${courseId}`, "PATCH", {
        isPublished: !isPublished,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/learning/courses"] });
      toast({
        title: variables.isPublished ? "Course unpublished" : "Course published",
        description: variables.isPublished 
          ? "The course is now in draft mode and hidden from agents." 
          : "The course is now live and visible to all agents.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update course status.",
        variant: "destructive",
      });
    },
  });

  const courses = data?.courses || [];

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-64" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto" data-testid="page-admin-learning">
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              Learning Center Management
            </h1>
            <p className="text-muted-foreground mt-2">
              Create and manage training courses and lessons
            </p>
          </div>
          <Link href="/learning/admin/courses/new">
            <Button data-testid="button-new-course">
              <Plus className="h-4 w-4 mr-2" />
              New Course
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Courses</CardTitle>
            <CardDescription>
              Manage your training content, lessons, and resources
            </CardDescription>
          </CardHeader>
          <CardContent>
            {courses.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No courses yet</h3>
                <p className="text-muted-foreground mb-4">
                  Get started by creating your first training course
                </p>
                <Link href="/learning/admin/courses/new">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Course
                  </Button>
                </Link>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Difficulty</TableHead>
                    <TableHead>Lessons</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courses.map((course) => (
                    <TableRow key={course.id} data-testid={`row-course-${course.id}`}>
                      <TableCell className="font-medium">{course.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {course.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {course.difficulty}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {course.lessonCount || 0} lesson{course.lessonCount !== 1 ? 's' : ''}
                          </span>
                          <Link href={`/learning/admin/lessons/new?courseId=${course.id}`}>
                            <Button variant="ghost" size="sm" data-testid={`button-add-lesson-${course.id}`}>
                              <Plus className="h-3 w-3 mr-1" />
                              Add
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                      <TableCell>{course.estimatedDuration} min</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => togglePublishMutation.mutate({ courseId: course.id, isPublished: course.isPublished })}
                          disabled={togglePublishMutation.isPending}
                          data-testid={`button-toggle-publish-${course.id}`}
                          className="gap-2"
                        >
                          {course.isPublished ? (
                            <>
                              <Globe className="h-3 w-3" />
                              <span>Published</span>
                            </>
                          ) : (
                            <>
                              <FileText className="h-3 w-3" />
                              <span>Draft</span>
                            </>
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/learning/courses/${course.slug}`}>
                            <Button variant="ghost" size="icon" data-testid={`button-view-${course.id}`}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Link href={`/learning/admin/courses/${course.id}`}>
                            <Button variant="ghost" size="icon" data-testid={`button-edit-${course.id}`}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Link>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-delete-${course.id}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete course?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete "{course.title}" and all its lessons. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(course.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
