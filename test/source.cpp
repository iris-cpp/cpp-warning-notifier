#include <iostream>

[[nodiscard]] int func() { return 42; }

int main() {
  int const value = func();
  std::cout << "Hello, World! " << value << std::endl;
}
