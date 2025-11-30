import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, Plus, Edit2, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const courseFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  slug: z.string().min(3, "Slug must be at least 3 characters").regex(/^[a-z0-9-]+$/, "Slug must be lowercase with hyphens only"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  thumbnail: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  category: z.enum(["onboarding", "operations", "training"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedDuration: z.coerce.number().min(1, "Duration must be at least 1 minute"),
  order: z.coerce.number().min(0),
  isPublished: z.boolean(),
});

type CourseFormValues = z.infer<typeof courseFormSchema>;

export default function AdminCourseForm() {
  const [, params] = useRoute("/learning/admin/courses/:id");
  const courseId = params?.id === "new" ? null : params?.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: courseData, isLoading } = useQuery({
    queryKey: ["/api/admin/learning/courses", courseId],
    queryFn: async () => {
      if (!courseId) return null;
      const response = await fetch(`/api/admin/learning/courses/${courseId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch course");
      return response.json();
    },
    enabled: !!courseId,
  });

  const { data: lessonsData = { lessons: [] }, isLoading: lessonsLoading } = useQuery({
    queryKey: ["/api/admin/learning/courses", courseId, "lessons"],
    queryFn: async () => {
      if (!courseId) return { lessons: [] };
      const response = await fetch(`/api/admin/learning/courses/${courseId}/lessons`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch lessons");
      return response.json();
    },
    enabled: !!courseId,
  });

  const deleteLesson = async (lessonId: string) => {
    try {
      await apiRequest("DELETE", `/api/admin/learning/lessons/${lessonId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/learning/courses", courseId, "lessons"] });
      toast({
        title: "Lesson deleted",
        description: "The lesson has been deleted successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete lesson",
        variant: "destructive",
      });
    }
  };

  const form = useForm<CourseFormValues>({
    resolver: zodResolver(courseFormSchema),
    defaultValues: {
      title: "",
      slug: "",
      description: "",
      thumbnail: "",
      category: "onboarding",
      difficulty: "beginner",
      estimatedDuration: 30,
      order: 0,
      isPublished: false,
    },
  });

  useEffect(() => {
    if (courseData?.course) {
      form.reset({
        title: courseData.course.title,
        slug: courseData.course.slug,
        description: courseData.course.description,
        thumbnail: courseData.course.thumbnail || "",
        category: courseData.course.category,
        difficulty: courseData.course.difficulty,
        estimatedDuration: courseData.course.estimatedDuration,
        order: courseData.course.order,
        isPublished: courseData.course.isPublished,
      });
    }
  }, [courseData, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: CourseFormValues) => {
      if (courseId) {
        return await apiRequest("PATCH", `/api/admin/learning/courses/${courseId}`, data);
      } else {
        return await apiRequest("POST", "/api/admin/learning/courses", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/learning/courses"] });
      toast({
        title: courseId ? "Course updated" : "Course created",
        description: courseId ? "Your changes have been saved." : "New course has been created successfully.",
      });
      setLocation("/learning/admin");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save course.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CourseFormValues) => {
    saveMutation.mutate(data);
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  };

  if (isLoading && courseId) {
    return (
      <div className="flex-1 overflow-auto p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-64" />
          <div className="h-96 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto" data-testid="page-admin-course-form">
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/learning/admin">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              {courseId ? "Edit Course" : "Create New Course"}
            </h1>
            <p className="text-muted-foreground mt-2">
              {courseId ? "Update course information and settings" : "Set up a new training course for your team"}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Course Details</CardTitle>
            <CardDescription>
              Fill in the basic information about your course
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Getting Started with OrderSync"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            if (!courseId) {
                              form.setValue("slug", generateSlug(e.target.value));
                            }
                          }}
                          data-testid="input-title"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL Slug</FormLabel>
                      <FormControl>
                        <Input placeholder="getting-started-with-ordersync" {...field} data-testid="input-slug" />
                      </FormControl>
                      <FormDescription>
                        URL-friendly identifier (lowercase, hyphens only)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Brief overview of what students will learn..."
                          rows={4}
                          {...field}
                          data-testid="input-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="thumbnail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Thumbnail URL (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://example.com/image.jpg"
                          {...field}
                          data-testid="input-thumbnail"
                        />
                      </FormControl>
                      <FormDescription>
                        URL to a cover image for the course
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-category">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="onboarding">Onboarding</SelectItem>
                            <SelectItem value="operations">Operations</SelectItem>
                            <SelectItem value="training">Training</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="difficulty"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Difficulty</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-difficulty">
                              <SelectValue placeholder="Select difficulty" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="beginner">Beginner</SelectItem>
                            <SelectItem value="intermediate">Intermediate</SelectItem>
                            <SelectItem value="advanced">Advanced</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="estimatedDuration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estimated Duration (minutes)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            data-testid="input-duration"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="order"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Order</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            data-testid="input-order"
                          />
                        </FormControl>
                        <FormDescription>
                          Lower numbers appear first
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="isPublished"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Published</FormLabel>
                        <FormDescription>
                          Make this course visible to students
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-published"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex gap-4">
                  <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save">
                    {saveMutation.isPending ? "Saving..." : courseId ? "Update Course" : "Create Course"}
                  </Button>
                  <Link href="/learning/admin">
                    <Button type="button" variant="outline" data-testid="button-cancel">
                      Cancel
                    </Button>
                  </Link>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {courseId && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Lessons</CardTitle>
                  <CardDescription>
                    Manage lessons for this course
                  </CardDescription>
                </div>
                <Link href={`/learning/admin/lessons/new?courseId=${courseId}`}>
                  <Button data-testid="button-add-lesson">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Lesson
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {lessonsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              ) : lessonsData.lessons && lessonsData.lessons.length > 0 ? (
                <div className="space-y-2">
                  {lessonsData.lessons.map((lesson: any) => (
                    <div
                      key={lesson.id}
                      className="flex items-center justify-between p-4 border rounded-md hover-elevate"
                      data-testid={`row-lesson-${lesson.id}`}
                    >
                      <div className="flex-1">
                        <h4 className="font-medium">{lesson.title}</h4>
                        <p className="text-sm text-muted-foreground">{lesson.slug}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/learning/admin/lessons/${lesson.id}`}>
                          <Button size="icon" variant="ghost" data-testid={`button-edit-${lesson.id}`}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteLesson(lesson.id)}
                          data-testid={`button-delete-${lesson.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No lessons yet. Click "Add Lesson" to create one.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
